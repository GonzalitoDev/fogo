-- Revisión de seguridad.

-- 1) [GRAVE] Plantillas: no se pueden crear roles con permisos que uno no tiene, ni por encima del propio rol,
--    ni roles sin permiso de administrar roles, ni canales sin administrar canales.
do $$
declare def text := pg_get_functiondef('public.fogon_apply_structure'::regproc);
begin
  def := replace(def, '  for ro in select * from jsonb_array_elements(coalesce(st->''roles'', ''[]''::jsonb)) loop
    exit when n_roles >= 100;',
'  for ro in select * from jsonb_array_elements(coalesce(st->''roles'', ''[]''::jsonb)) loop
    exit when n_roles >= 100 or not public.fogon_has_perm(p_server, ''manage_roles'');');
  def := replace(def, '            least(greatest(coalesce((ro->>''position'')::int, 1), 1), 999),',
'            least(greatest(coalesce((ro->>''position'')::int, 1), 1), greatest(public.fogon_top_position(p_server, auth.uid()) - 1, 1)),');
  def := replace(def, 'where x = any(public.fogon_all_perms())), ''{}''),',
'where x = any(public.fogon_my_perms(p_server))), ''{}''),');
  def := replace(def, '  for cat in select * from jsonb_array_elements(coalesce(st->''categories'', ''[]''::jsonb)) loop
    exit when n_canales >= 150;',
'  for cat in select * from jsonb_array_elements(coalesce(st->''categories'', ''[]''::jsonb)) loop
    exit when n_canales >= 150 or not public.fogon_has_perm(p_server, ''manage_channels'');');
  def := replace(def, '  for ch in select * from jsonb_array_elements(coalesce(st->''loose'', ''[]''::jsonb)) loop
    exit when n_canales >= 150;',
'  for ch in select * from jsonb_array_elements(coalesce(st->''loose'', ''[]''::jsonb)) loop
    exit when n_canales >= 150 or not public.fogon_has_perm(p_server, ''manage_channels'');');
  if position('fogon_my_perms(p_server)' in def) = 0 or position('fogon_top_position' in def) = 0
     or (length(def) - length(replace(def, '''manage_channels''', ''))) / length('''manage_channels''') < 2
     or position('''manage_roles''' in def) = 0 then
    raise exception 'no pude ajustar fogon_apply_structure';
  end if;
  execute def;
end $$;
-- y por si acaso: un rol no puede quedar por encima de quien lo crea (vale para todo, también funciones)
create or replace function public.fogon_roles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); top integer;
begin
  -- solo cuando lo hace una persona con sesión (no migraciones ni tareas internas)
  if me is null then return new; end if;
  top := public.fogon_top_position(new.server_id, me);
  if top >= 1000 then return new; end if; -- el dueño puede todo
  if (tg_op = 'INSERT' or new.position is distinct from old.position) and new.position >= top then
    raise exception 'No podés crear o subir un rol por encima del tuyo.';
  end if;
  if (tg_op = 'INSERT' or new.perms is distinct from old.perms)
     and exists (select 1 from unnest(new.perms) x
                 where not (x = any(public.fogon_my_perms(new.server_id)))
                   and (tg_op = 'INSERT' or not (x = any(old.perms)))) then
    raise exception 'No podés darle a un rol permisos que vos no tenés.';
  end if;
  return new;
end $$;
revoke execute on function public.fogon_roles_guard() from public, anon, authenticated;
create or replace trigger fogon_roles_guard before insert or update of position, perms on public.fogon_roles
  for each row execute function public.fogon_roles_guard();

-- 2) Mensajes: al mandar uno no se lo puede marcar como fijado (ni "fijado por" otra persona)
do $$
declare def text := pg_get_functiondef('public.fogon_messages_before'::regproc);
begin
  def := replace(def, '    new.created_at := clock_timestamp();
    new.edited_at := null;', '    new.created_at := clock_timestamp();
    new.edited_at := null;
    if auth.uid() is not null then
      new.pinned_at := null;
      new.pinned_by := null;
    end if;');
  if position('new.pinned_by := null' in def) = 0 then raise exception 'no pude ajustar fogon_messages_before'; end if;
  execute def;
end $$;

-- 3) Perfiles: la fecha de creación de la cuenta no se puede inventar (daría la insignia "Pionero")
do $$
declare def text := pg_get_functiondef('public.fogon_profiles_guard'::regproc);
begin
  def := replace(def, '      new.is_official := false;
    else', '      new.is_official := false;
      new.created_at := now();
      new.deleted_at := null;
    else');
  if position('new.created_at := now()' in def) = 0 then raise exception 'no pude ajustar fogon_profiles_guard'; end if;
  execute def;
end $$;

-- 4) Canales: desde la app solo se cambia nombre, tema, posición y categoría (no el servidor, el tipo ni fechas),
--    y la categoría tiene que ser del mismo servidor
revoke update on public.fogon_channels from authenticated;
grant update (name, topic, position, parent_id) on public.fogon_channels to authenticated;
create or replace function public.fogon_channels_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.fogon_channels p where p.id = new.parent_id and p.kind = 'category' and p.server_id = new.server_id and p.id <> new.id
  ) then
    raise exception 'Esa categoría no es de este servidor.';
  end if;
  if auth.uid() is not null and tg_op = 'INSERT' then
    new.created_at := now();
    new.last_message_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.fogon_channels_guard() from public, anon, authenticated;
create or replace trigger fogon_channels_guard before insert or update of parent_id on public.fogon_channels
  for each row execute function public.fogon_channels_guard();

-- 5) Íconos de servidor: solo imágenes subidas a Fogón (o los logos de la app), nada de links externos que rastreen
alter table public.fogon_servers drop constraint if exists fogon_servers_icon_url_check;
alter table public.fogon_servers add constraint fogon_servers_icon_url_check check (
  icon_url is null or icon_url ~ '^/logos/[a-z0-9-]+\.svg$'
  or icon_url like 'https://xfwolaurpeofysnymqle.supabase.co/storage/v1/object/public/fogon-profiles/%'
);

-- 6) Funciones de consulta que no hace falta exponer
revoke execute on function public.fogon_is_staff(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fogon_perms_of(uuid, uuid) from authenticated;
revoke execute on function public.fogon_channel_allows_for(uuid, text, uuid) from authenticated;

-- 7) Tiempo real: "quién está conectado" y "está escribiendo" solo para gente con sesión
--    (antes cualquiera con la clave pública podía mirar y hacerse pasar por otro)
create or replace function public.fogon_typing_topic_ok(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  begin
    cid := split_part(p_topic, ':', 2)::uuid;
  exception when others then return false;
  end;
  return public.fogon_can_read(cid);
end $$;
revoke execute on function public.fogon_typing_topic_ok(text) from public, anon;
grant execute on function public.fogon_typing_topic_ok(text) to authenticated;

create policy fogon_presence_receive on realtime.messages for select to authenticated
  using (realtime.topic() = 'fogon-presence'
         or (realtime.topic() like 'typing:%' and public.fogon_typing_topic_ok(realtime.topic())));
create policy fogon_presence_send on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'fogon-presence'
              or (realtime.topic() like 'typing:%' and public.fogon_typing_topic_ok(realtime.topic())));
