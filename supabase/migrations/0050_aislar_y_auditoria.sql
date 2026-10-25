-- Aislar miembros (timeout tipo Discord) y registro de auditoría.
-- También suma los permisos que usan hilos, encuestas y emojis propios.

-- 1) permisos nuevos
create or replace function public.fogon_all_perms()
returns text[] language sql immutable set search_path = '' as $$
  select array['view_channel', 'manage_channels', 'manage_roles', 'manage_server', 'manage_emojis', 'view_audit_log', 'create_invite',
               'kick_members', 'ban_members', 'moderate_members',
               'send_messages', 'add_reactions', 'attach_files', 'mention_everyone', 'manage_messages', 'create_threads', 'manage_threads', 'create_polls',
               'connect', 'speak', 'video', 'mute_members', 'deafen_members', 'move_members',
               'administrator']::text[]
$$;
create or replace function public.fogon_chan_perms()
returns text[] language sql immutable set search_path = '' as $$
  select array['view_channel', 'send_messages', 'add_reactions', 'attach_files', 'create_threads', 'create_polls', 'connect', 'speak', 'video']::text[]
$$;
alter table public.fogon_servers alter column everyone_perms
  set default array['view_channel', 'create_invite', 'send_messages', 'add_reactions', 'attach_files', 'create_threads', 'create_polls', 'connect', 'speak', 'video']::text[];
-- lo que ya podía hacer todo el mundo, ahora también puede crear hilos y encuestas (como en Discord)
update public.fogon_servers set everyone_perms = everyone_perms || array['create_threads', 'create_polls']
where 'send_messages' = any(everyone_perms) and not ('create_threads' = any(everyone_perms));
update public.fogon_roles set perms = public.fogon_all_perms() where id = '7c1d1f00-0000-4000-8000-00000000e001';

-- 2) aislar: quien está aislado solo puede leer (no escribe, no reacciona, no entra a voz), salvo administradores
alter table public.fogon_timeouts add column if not exists by_id uuid references public.fogon_profiles (id) on delete set null;
alter table public.fogon_timeouts add column if not exists at timestamptz not null default now();
alter table public.fogon_timeouts enable row level security;
drop policy if exists fogon_timeouts_select on public.fogon_timeouts;
create policy fogon_timeouts_select on public.fogon_timeouts for select to authenticated using (public.fogon_is_member(server_id));
revoke insert, update, delete on public.fogon_timeouts from authenticated, anon;
grant select on public.fogon_timeouts to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.fogon_timeouts;
exception when duplicate_object then null; end $$;

do $$
declare def text := pg_get_functiondef('public.fogon_perms_of'::regproc);
begin
  def := replace(def, '  if ''administrator'' = any(acc) then return public.fogon_all_perms(); end if;
  return acc;', '  if ''administrator'' = any(acc) then return public.fogon_all_perms(); end if;
  -- aislado: solo leer
  if exists (select 1 from public.fogon_timeouts t where t.server_id = p_server and t.user_id = p_user and t.until > now()) then
    return array[''view_channel''];
  end if;
  return acc;');
  if position('aislado: solo leer' in def) = 0 then raise exception 'no pude ajustar fogon_perms_of'; end if;
  execute def;
end $$;

create or replace function public.fogon_timeout(p_server uuid, p_user uuid, p_minutes integer, p_reason text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if not public.fogon_has_perm(p_server, 'moderate_members') then raise exception 'No tenés permiso para aislar miembros.'; end if;
  if p_user = auth.uid() then raise exception 'No te podés aislar a vos mismo.'; end if;
  if exists (select 1 from public.fogon_servers where id = p_server and owner_id = p_user) then raise exception 'No se puede aislar al dueño del servidor.'; end if;
  if 'administrator' = any(public.fogon_perms_of(p_server, p_user)) then raise exception 'No se puede aislar a un administrador.'; end if;
  if not public.fogon_outranks(p_server, p_user) then raise exception 'No podés aislar a alguien de tu mismo rango o más alto.'; end if;
  if coalesce(p_minutes, 0) <= 0 then
    delete from public.fogon_timeouts where server_id = p_server and user_id = p_user;
    return null;
  end if;
  if p_minutes > 40320 then raise exception 'Lo máximo son 28 días.'; end if;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.fogon_timeouts (server_id, user_id, until, reason, by_id, at)
  values (p_server, p_user, v_until, left(btrim(coalesce(p_reason, '')), 200), auth.uid(), now())
  on conflict (server_id, user_id) do update set until = excluded.until, reason = excluded.reason, by_id = excluded.by_id, at = excluded.at;
  return v_until;
end $$;
revoke execute on function public.fogon_timeout(uuid, uuid, integer, text) from public, anon;
grant execute on function public.fogon_timeout(uuid, uuid, integer, text) to authenticated;

-- 3) registro de auditoría
create table if not exists public.fogon_audit (
  id bigserial primary key,
  server_id uuid not null references public.fogon_servers (id) on delete cascade,
  actor_id uuid references public.fogon_profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  target_name text,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists fogon_audit_server_at on public.fogon_audit (server_id, at desc);
alter table public.fogon_audit enable row level security;
revoke all on public.fogon_audit from anon, authenticated;
grant select on public.fogon_audit to authenticated;
create policy fogon_audit_select on public.fogon_audit for select to authenticated using (public.fogon_has_perm(server_id, 'view_audit_log'));

create or replace function public.fogon_audit_add(p_server uuid, p_action text, p_type text, p_id text, p_name text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_server is null then return; end if;
  if not exists (select 1 from public.fogon_servers where id = p_server) then return; end if;
  insert into public.fogon_audit (server_id, actor_id, action, target_type, target_id, target_name, details)
  values (p_server, auth.uid(), p_action, p_type, p_id, p_name, coalesce(p_details, '{}'));
end $$;
revoke execute on function public.fogon_audit_add(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.fogon_audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record; o record; me uuid := auth.uid(); v_name text; v_srv uuid; d jsonb := '{}';
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_op = 'UPDATE' then o := old; end if;

  if tg_table_name = 'fogon_roles' then
    if tg_op = 'UPDATE' then
      if o.name is distinct from r.name then d := d || jsonb_build_object('nombre', jsonb_build_array(o.name, r.name)); end if;
      if o.color is distinct from r.color then d := d || jsonb_build_object('color', jsonb_build_array(o.color, r.color)); end if;
      if o.perms is distinct from r.perms then
        d := d || jsonb_build_object('permisos_dados', (select coalesce(jsonb_agg(x), '[]') from unnest(r.perms) x where not (x = any(o.perms))),
                                     'permisos_sacados', (select coalesce(jsonb_agg(x), '[]') from unnest(o.perms) x where not (x = any(r.perms))));
      end if;
      if d = '{}' then return null; end if; -- solo cambió la posición u otra cosa menor
    elsif tg_op = 'INSERT' then d := jsonb_build_object('permisos', to_jsonb(r.perms));
    end if;
    perform public.fogon_audit_add(r.server_id, 'role_' || lower(tg_op), 'role', r.id::text, r.name, d);

  elsif tg_table_name = 'fogon_member_roles' then
    if me is null or me = r.user_id then return null; end if; -- automático al entrar
    select name into v_name from public.fogon_roles where id = r.role_id;
    -- si se borró el rol o echaron a la persona, ya queda registrado eso
    if v_name is null or not exists (select 1 from public.fogon_members m where m.server_id = r.server_id and m.user_id = r.user_id) then return null; end if;
    perform public.fogon_audit_add(r.server_id, case when tg_op = 'INSERT' then 'member_role_add' else 'member_role_remove' end,
      'user', r.user_id::text, (select username from public.fogon_profiles where id = r.user_id), jsonb_build_object('rol', v_name));

  elsif tg_table_name = 'fogon_channels' then
    if r.server_id is null or r.kind = 'dm' then return null; end if;
    if tg_op = 'UPDATE' then
      if o.name is distinct from r.name then d := d || jsonb_build_object('nombre', jsonb_build_array(o.name, r.name)); end if;
      if o.topic is distinct from r.topic then d := d || jsonb_build_object('tema', jsonb_build_array(o.topic, r.topic)); end if;
      if o.parent_id is distinct from r.parent_id then d := d || jsonb_build_object('categoria', 'cambió'); end if;
      if d = '{}' then return null; end if;
    end if;
    perform public.fogon_audit_add(r.server_id, case when r.kind = 'thread' then 'thread_' else 'channel_' end || lower(tg_op), 'channel', r.id::text, r.name, d || jsonb_build_object('tipo', r.kind));

  elsif tg_table_name = 'fogon_channel_overrides' then
    select name into v_name from public.fogon_channels where id = r.channel_id;
    perform public.fogon_audit_add(r.server_id, 'channel_perms_update', 'channel', r.channel_id::text, v_name,
      jsonb_build_object('para', coalesce((select name from public.fogon_roles where id = r.role_id), '@everyone'),
                         'permitido', to_jsonb(case when tg_op = 'DELETE' then '{}'::text[] else r.allow end),
                         'denegado', to_jsonb(case when tg_op = 'DELETE' then '{}'::text[] else r.deny end)));

  elsif tg_table_name = 'fogon_members' then
    if tg_op <> 'DELETE' or me is null or me = r.user_id then return null; end if;
    if exists (select 1 from public.fogon_bans b where b.server_id = r.server_id and b.user_id = r.user_id) then return null; end if;
    perform public.fogon_audit_add(r.server_id, 'member_kick', 'user', r.user_id::text, (select username from public.fogon_profiles where id = r.user_id), '{}');

  elsif tg_table_name = 'fogon_bans' then
    perform public.fogon_audit_add(r.server_id, case when tg_op = 'DELETE' then 'member_unban' else 'member_ban' end, 'user', r.user_id::text,
      (select username from public.fogon_profiles where id = r.user_id), jsonb_build_object('motivo', case when tg_op = 'DELETE' then null else r.reason end));

  elsif tg_table_name = 'fogon_timeouts' then
    perform public.fogon_audit_add(r.server_id, case when tg_op = 'DELETE' then 'member_timeout_remove' else 'member_timeout' end, 'user', r.user_id::text,
      (select username from public.fogon_profiles where id = r.user_id),
      case when tg_op = 'DELETE' then '{}' else jsonb_build_object('hasta', r.until, 'motivo', nullif(r.reason, '')) end);

  elsif tg_table_name = 'fogon_servers' then
    if tg_op <> 'UPDATE' then return null; end if;
    if o.name is distinct from r.name then d := d || jsonb_build_object('nombre', jsonb_build_array(o.name, r.name)); end if;
    if o.icon_url is distinct from r.icon_url then d := d || jsonb_build_object('icono', 'cambió'); end if;
    if o.invite_code is distinct from r.invite_code then d := d || jsonb_build_object('invitacion', 'link nuevo'); end if;
    if o.everyone_perms is distinct from r.everyone_perms then
      d := d || jsonb_build_object('everyone_dados', (select coalesce(jsonb_agg(x), '[]') from unnest(r.everyone_perms) x where not (x = any(o.everyone_perms))),
                                   'everyone_sacados', (select coalesce(jsonb_agg(x), '[]') from unnest(o.everyone_perms) x where not (x = any(r.everyone_perms))));
    end if;
    if d = '{}' or me is null then return null; end if;
    perform public.fogon_audit_add(r.id, 'server_update', 'server', r.id::text, r.name, d);

  elsif tg_table_name = 'fogon_messages' then
    select server_id, name into v_srv, v_name from public.fogon_channels where id = r.channel_id;
    if v_srv is null or me is null then return null; end if;
    if tg_op = 'DELETE' then
      if me = r.author_id then return null; end if; -- borró lo suyo
      perform public.fogon_audit_add(v_srv, 'message_delete', 'user', r.author_id::text, (select username from public.fogon_profiles where id = r.author_id),
        jsonb_build_object('canal', v_name));
    elsif tg_op = 'UPDATE' and o.pinned_at is distinct from r.pinned_at then
      perform public.fogon_audit_add(v_srv, case when r.pinned_at is null then 'message_unpin' else 'message_pin' end, 'user', r.author_id::text,
        (select username from public.fogon_profiles where id = r.author_id), jsonb_build_object('canal', v_name));
    end if;

  elsif tg_table_name = 'fogon_voice_mods' then
    if tg_op = 'UPDATE' then
      if o.muted is distinct from r.muted then d := d || jsonb_build_object('silenciado', r.muted); end if;
      if o.deafened is distinct from r.deafened then d := d || jsonb_build_object('ensordecido', r.deafened); end if;
    else d := jsonb_build_object('silenciado', r.muted, 'ensordecido', r.deafened);
    end if;
    if d = '{}' then return null; end if;
    perform public.fogon_audit_add(r.server_id, 'member_voice_mod', 'user', r.user_id::text, (select username from public.fogon_profiles where id = r.user_id), d);
  end if;
  return null;
end $$;
revoke execute on function public.fogon_audit_trigger() from public, anon, authenticated;

create or replace trigger fogon_audit after insert or delete or update of name, color, perms on public.fogon_roles for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or delete on public.fogon_member_roles for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or delete or update of name, topic, parent_id on public.fogon_channels for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or update or delete on public.fogon_channel_overrides for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after delete on public.fogon_members for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or delete on public.fogon_bans for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or update or delete on public.fogon_timeouts for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after update of name, icon_url, invite_code, everyone_perms on public.fogon_servers for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after update of pinned_at or delete on public.fogon_messages for each row execute function public.fogon_audit_trigger();
create or replace trigger fogon_audit after insert or update on public.fogon_voice_mods for each row execute function public.fogon_audit_trigger();

-- aislado: los permisos de canal tampoco le devuelven escribir, reaccionar o hablar
do $$
declare def text := pg_get_functiondef('public.fogon_channel_allows_for'::regproc);
begin
  def := replace(def, '  ok := p_perm = any(base);', '  if p_perm <> ''view_channel'' and exists (select 1 from public.fogon_timeouts t where t.server_id = c.server_id and t.user_id = p_user and t.until > now()) then
    return false; -- aislado
  end if;
  ok := p_perm = any(base);');
  if position('-- aislado' in def) = 0 then raise exception 'no pude ajustar fogon_channel_allows_for'; end if;
  execute def;
end $$;
