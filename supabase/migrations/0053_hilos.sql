-- Hilos (como Discord): una charla aparte que sale de un mensaje de un canal de texto.
-- Un hilo es un canal kind = 'thread' cuyo parent_id es el canal de texto. Hereda los permisos del canal:
-- lo ve quien ve el canal y escribe quien puede escribir ahí. Se puede archivar (queda de solo lectura).

alter table public.fogon_channels drop constraint if exists fogon_channels_kind_check;
alter table public.fogon_channels add constraint fogon_channels_kind_check check (kind = any (array['text', 'category', 'dm', 'voice', 'thread']));
alter table public.fogon_channels add column if not exists starter_id uuid references public.fogon_messages (id) on delete set null;
alter table public.fogon_channels add column if not exists owner_id uuid references public.fogon_profiles (id) on delete set null;
alter table public.fogon_channels add column if not exists archived boolean not null default false;
alter table public.fogon_channels drop constraint if exists fogon_channels_thread_parent;
alter table public.fogon_channels add constraint fogon_channels_thread_parent check (kind <> 'thread' or parent_id is not null);
create unique index if not exists fogon_channels_starter on public.fogon_channels (starter_id) where starter_id is not null;
create index if not exists fogon_channels_threads on public.fogon_channels (parent_id) where kind = 'thread';
grant select (starter_id, owner_id, archived) on public.fogon_channels to authenticated;

-- el "padre" de un hilo es un canal de texto; el de los demás, una categoría
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_channels_check'::regproc);
  def := replace(def, 'select 1 from public.fogon_channels c where c.id = new.parent_id and c.kind = ''category'' and c.server_id = new.server_id',
                      'select 1 from public.fogon_channels c where c.id = new.parent_id and c.kind = (case when new.kind = ''thread'' then ''text'' else ''category'' end) and c.server_id = new.server_id');
  if position('''thread''' in def) = 0 then raise exception 'no pude ajustar fogon_channels_check'; end if;
  execute def;

  def := pg_get_functiondef('public.fogon_channels_guard'::regproc);
  def := replace(def, 'select 1 from public.fogon_channels p where p.id = new.parent_id and p.kind = ''category'' and p.server_id = new.server_id and p.id <> new.id',
                      'select 1 from public.fogon_channels p where p.id = new.parent_id and p.kind = (case when new.kind = ''thread'' then ''text'' else ''category'' end) and p.server_id = new.server_id and p.id <> new.id');
  if position('''thread''' in def) = 0 then raise exception 'no pude ajustar fogon_channels_guard'; end if;
  execute def;

  -- permisos: un hilo hace lo mismo que su canal
  def := pg_get_functiondef('public.fogon_channel_allows_for'::regproc);
  def := replace(def, '  if c.kind = ''dm'' then return true; end if;', '  if c.kind = ''dm'' then return true; end if;
  if c.kind = ''thread'' then return public.fogon_channel_allows_for(c.parent_id, p_perm, p_user); end if;');
  if position('''thread''' in def) = 0 then raise exception 'no pude ajustar fogon_channel_allows_for'; end if;
  execute def;

  -- sin leer: hilos que abriste o que creaste (como "seguir" un hilo en Discord)
  def := pg_get_functiondef('public.fogon_unread'::regproc);
  def := replace(def, '    where c.kind = ''text''
    union all', '    where (c.kind = ''text'' or (c.kind = ''thread'' and not c.archived and (c.owner_id = auth.uid()
           or exists (select 1 from public.fogon_read_states rs where rs.channel_id = c.id and rs.user_id = auth.uid()))))
    union all');
  if position('''thread''' in def) = 0 then raise exception 'no pude ajustar fogon_unread'; end if;
  execute def;

  def := pg_get_functiondef('public.fogon_mark_read_all'::regproc);
  def := replace(def, 'c.server_id = p_server and c.kind = ''text''', 'c.server_id = p_server and c.kind in (''text'', ''thread'')');
  if position('''thread''' in def) = 0 then raise exception 'no pude ajustar fogon_mark_read_all'; end if;
  execute def;

  -- auditoría: archivar / reabrir
  def := pg_get_functiondef('public.fogon_audit_trigger'::regproc);
  def := replace(def, '      if o.parent_id is distinct from r.parent_id then d := d || jsonb_build_object(''categoria'', ''cambió''); end if;',
                      '      if o.parent_id is distinct from r.parent_id then d := d || jsonb_build_object(''categoria'', ''cambió''); end if;
      if o.archived is distinct from r.archived then d := d || jsonb_build_object(''archivado'', r.archived); end if;');
  if position('archivado' in def) = 0 then raise exception 'no pude ajustar fogon_audit_trigger'; end if;
  execute def;
end $$;
create or replace trigger fogon_audit after insert or delete or update of name, topic, parent_id, archived on public.fogon_channels for each row execute function public.fogon_audit_trigger();

-- mensajes: también en hilos (no archivados)
drop policy if exists fogon_messages_insert on public.fogon_messages;
create policy fogon_messages_insert on public.fogon_messages for insert to authenticated with check (
  author_id = (select auth.uid())
  and public.fogon_can_read(channel_id)
  and exists (select 1 from public.fogon_channels c where c.id = fogon_messages.channel_id
              and (c.kind = any (array['text', 'dm']) or (c.kind = 'thread' and not c.archived)))
  and public.fogon_channel_allows(channel_id, 'send_messages')
  and (jsonb_array_length(attachments) = 0 or public.fogon_channel_allows(channel_id, 'attach_files'))
);

-- crear un hilo (desde un mensaje, o suelto en el canal)
create or replace function public.fogon_create_thread(p_channel uuid, p_message uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c record; v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_msg record;
begin
  if me is null then raise exception 'Tenés que iniciar sesión.'; end if;
  if p_message is not null then
    select id, channel_id, content into v_msg from public.fogon_messages where id = p_message;
    if v_msg.id is null then raise exception 'Ese mensaje no existe.'; end if;
    p_channel := v_msg.channel_id;
    select id into v_id from public.fogon_channels where starter_id = p_message;
    if v_id is not null then return v_id; end if; -- ya tiene hilo: abrimos ese
  end if;
  select id, kind, server_id into c from public.fogon_channels where id = p_channel;
  if c.id is null or c.kind <> 'text' then raise exception 'Solo se pueden abrir hilos en canales de texto.'; end if;
  if not public.fogon_can_read(p_channel) then raise exception 'No ves ese canal.'; end if;
  if not public.fogon_channel_allows(p_channel, 'create_threads') or not public.fogon_channel_allows(p_channel, 'send_messages') then
    raise exception 'No tenés permiso para crear hilos en este canal.';
  end if;
  if length(v_name) = 0 then
    v_name := left(btrim(regexp_replace(regexp_replace(coalesce(v_msg.content, ''), '<a?:([A-Za-z0-9_]+):[0-9a-f-]{36}>', ':\1:', 'g'), '\s+', ' ', 'g')), 40);
  end if;
  if length(v_name) = 0 then v_name := 'Hilo nuevo'; end if;
  v_name := left(v_name, 100);
  if (select count(*) from public.fogon_channels where parent_id = p_channel and kind = 'thread' and not archived) >= 100 then
    raise exception 'Este canal ya tiene demasiados hilos abiertos. Archivá alguno.';
  end if;
  insert into public.fogon_channels (server_id, kind, name, topic, position, parent_id, starter_id, owner_id)
  values (c.server_id, 'thread', v_name, '', 0, p_channel, p_message, me)
  returning id into v_id;
  insert into public.fogon_read_states (user_id, channel_id, last_read_at) values (me, v_id, now())
  on conflict (user_id, channel_id) do update set last_read_at = now();
  return v_id;
end $$;
revoke execute on function public.fogon_create_thread(uuid, uuid, text) from public, anon;
grant execute on function public.fogon_create_thread(uuid, uuid, text) to authenticated;

-- renombrar / archivar / reabrir: quien lo creó o quien tenga "Administrar hilos"
create or replace function public.fogon_thread_update(p_thread uuid, p_name text, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.fogon_channels where id = p_thread and kind = 'thread';
  if t.id is null or not public.fogon_can_read(p_thread) then raise exception 'Ese hilo no existe.'; end if;
  if not (t.owner_id = auth.uid() or public.fogon_has_perm(t.server_id, 'manage_threads') or public.fogon_has_perm(t.server_id, 'manage_channels')) then
    raise exception 'Solo quien creó el hilo o quien administra hilos puede cambiarlo.';
  end if;
  if p_name is not null and length(btrim(p_name)) = 0 then raise exception 'El hilo necesita un nombre.'; end if;
  update public.fogon_channels set
    name = coalesce(left(btrim(p_name), 100), name),
    archived = coalesce(p_archived, archived)
  where id = p_thread;
end $$;
revoke execute on function public.fogon_thread_update(uuid, text, boolean) from public, anon;
grant execute on function public.fogon_thread_update(uuid, text, boolean) to authenticated;

create or replace function public.fogon_thread_delete(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.fogon_channels where id = p_thread and kind = 'thread';
  if t.id is null then raise exception 'Ese hilo no existe.'; end if;
  if not (public.fogon_has_perm(t.server_id, 'manage_threads') or public.fogon_has_perm(t.server_id, 'manage_channels')) then
    raise exception 'No tenés permiso para borrar hilos.';
  end if;
  delete from public.fogon_channels where id = p_thread;
end $$;
revoke execute on function public.fogon_thread_delete(uuid) from public, anon;
grant execute on function public.fogon_thread_delete(uuid) to authenticated;

-- si se borra el canal, se van sus hilos (el FK de parent_id es "set null", que dejaría hilos huérfanos)
create or replace function public.fogon_threads_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.kind = 'text' then delete from public.fogon_channels where parent_id = old.id and kind = 'thread'; end if;
  return old;
end $$;
revoke execute on function public.fogon_threads_cleanup() from public, anon, authenticated;
create or replace trigger fogon_threads_cleanup before delete on public.fogon_channels for each row execute function public.fogon_threads_cleanup();
