-- Permisos tipo Discord.
--  * 19 permisos de rol (generales, miembros, texto, voz y Administrador).
--  * @everyone editable: lo que puede hacer todo el mundo en el servidor (antes era fijo).
--  * Permisos de canal también para voz: conectarse, hablar y video.
--  * Administrador y el dueño tienen todo y se saltean los permisos de canal.
--  * Silenciar / ensordecer en el servidor y "Mover miembros" como permisos propios.

create or replace function public.fogon_all_perms()
returns text[] language sql immutable set search_path = '' as $$
  select array['view_channel', 'manage_channels', 'manage_roles', 'manage_server', 'create_invite',
               'kick_members', 'ban_members',
               'send_messages', 'add_reactions', 'attach_files', 'mention_everyone', 'manage_messages',
               'connect', 'speak', 'video', 'mute_members', 'deafen_members', 'move_members',
               'administrator']::text[]
$$;

create or replace function public.fogon_chan_perms()
returns text[] language sql immutable set search_path = '' as $$
  select array['view_channel', 'send_messages', 'add_reactions', 'attach_files', 'connect', 'speak', 'video']::text[]
$$;

alter table public.fogon_roles drop constraint if exists fogon_roles_perms_check;
alter table public.fogon_roles add constraint fogon_roles_perms_check check (perms <@ public.fogon_all_perms());
alter table public.fogon_channel_overrides drop constraint if exists fogon_channel_overrides_allow_check;
alter table public.fogon_channel_overrides drop constraint if exists fogon_channel_overrides_deny_check;
alter table public.fogon_channel_overrides add constraint fogon_channel_overrides_allow_check check (allow <@ public.fogon_chan_perms());
alter table public.fogon_channel_overrides add constraint fogon_channel_overrides_deny_check check (deny <@ public.fogon_chan_perms());

-- @everyone: lo básico para todos (lo mismo que se podía hacer antes)
alter table public.fogon_servers add column if not exists everyone_perms text[] not null
  default array['view_channel', 'create_invite', 'send_messages', 'add_reactions', 'attach_files', 'connect', 'speak', 'video']::text[];
alter table public.fogon_servers drop constraint if exists fogon_servers_everyone_perms_check;
alter table public.fogon_servers add constraint fogon_servers_everyone_perms_check check (everyone_perms <@ public.fogon_all_perms());

-- permisos de una persona en un servidor
create or replace function public.fogon_perms_of(p_server uuid, p_user uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare s record; acc text[];
begin
  select owner_id, everyone_perms into s from public.fogon_servers where id = p_server;
  if s.owner_id is null or p_user is null then return '{}'; end if;
  if s.owner_id = p_user then return public.fogon_all_perms(); end if;
  if not exists (select 1 from public.fogon_members where server_id = p_server and user_id = p_user) then return '{}'; end if;
  select coalesce(array_agg(distinct x), '{}') into acc from (
    select unnest(s.everyone_perms) x
    union select unnest(r.perms) from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id
      where mr.server_id = p_server and mr.user_id = p_user
  ) t;
  if 'administrator' = any(acc) then return public.fogon_all_perms(); end if;
  return acc;
end $$;
revoke execute on function public.fogon_perms_of(uuid, uuid) from public, anon;

create or replace function public.fogon_my_perms(p_server uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select public.fogon_perms_of(p_server, auth.uid())
$$;

create or replace function public.fogon_has_perm(p_server uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_perm = any(public.fogon_perms_of(p_server, auth.uid()))
$$;

-- permiso en un canal (como Discord): base del servidor, después @everyone y roles de la categoría y del canal
create or replace function public.fogon_channel_allows_for(p_channel uuid, p_perm text, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  c record; lvl uuid; ok boolean; base text[]; ev record; r_allow boolean; r_deny boolean;
begin
  select id, server_id, parent_id, kind into c from public.fogon_channels where id = p_channel;
  if c.id is null then return false; end if;
  if c.kind = 'dm' then return true; end if;
  base := public.fogon_perms_of(c.server_id, p_user);
  if 'administrator' = any(base) or exists (select 1 from public.fogon_servers s where s.id = c.server_id and s.owner_id = p_user) then
    return true;
  end if;
  ok := p_perm = any(base);
  if not (p_perm = any(public.fogon_chan_perms())) then return ok; end if;
  foreach lvl in array array_remove(array[c.parent_id, c.id], null) loop
    select allow, deny into ev from public.fogon_channel_overrides where channel_id = lvl and role_id is null;
    if found then
      if p_perm = any(ev.deny) then ok := false; end if;
      if p_perm = any(ev.allow) then ok := true; end if;
    end if;
    select bool_or(p_perm = any(o.allow)), bool_or(p_perm = any(o.deny)) into r_allow, r_deny
    from public.fogon_channel_overrides o
    join public.fogon_member_roles mr on mr.role_id = o.role_id and mr.user_id = p_user and mr.server_id = c.server_id
    where o.channel_id = lvl;
    if r_deny then ok := false; end if;
    if r_allow then ok := true; end if;
  end loop;
  if p_perm <> 'view_channel' and ok then
    return public.fogon_channel_allows_for(p_channel, 'view_channel', p_user);
  end if;
  return ok;
end $$;
revoke execute on function public.fogon_channel_allows_for(uuid, text, uuid) from public, anon;

create or replace function public.fogon_channel_allows(p_channel uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fogon_channel_allows_for(p_channel, p_perm, auth.uid())
$$;

-- staff (para bots y avisos): también Administrador
create or replace function public.fogon_is_staff(p_server uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_servers s where s.id = p_server and s.owner_id = p_user)
      or public.fogon_perms_of(p_server, p_user) && array['administrator', 'manage_messages', 'manage_server', 'kick_members', 'ban_members']
$$;

-- @everyone en los mensajes: cuenta el permiso de @everyone y el de Administrador
do $$
declare def text := pg_get_functiondef('public.fogon_messages_before'::regproc);
begin
  def := replace(def, '''mention_everyone'' = any(r.perms)));', '''mention_everyone'' = any(r.perms))
         or ''mention_everyone'' = any(public.fogon_perms_of(ch.server_id, new.author_id)));');
  if position('fogon_perms_of' in def) = 0 then raise exception 'no pude ajustar fogon_messages_before'; end if;
  execute def;
end $$;

-- voz: para entrar a la llamada hace falta "Conectarse"
create or replace function public.fogon_voice_topic_ok(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  if p_topic not like 'fogon-voice:%' then return false; end if;
  begin
    cid := split_part(p_topic, ':', 2)::uuid;
  exception when others then return false;
  end;
  return exists (select 1 from public.fogon_channels c where c.id = cid and c.kind = 'voice')
    and public.fogon_can_read(cid) and public.fogon_channel_allows(cid, 'connect');
end $$;

-- mover gente: ahora es "Mover miembros"
do $$
declare def text := pg_get_functiondef('public.fogon_voice_move'::regproc);
begin
  def := replace(def, 'public.fogon_has_perm(ch.server_id, ''manage_channels'')', 'public.fogon_has_perm(ch.server_id, ''move_members'')');
  if position('move_members' in def) = 0 then raise exception 'no pude ajustar fogon_voice_move'; end if;
  execute def;
end $$;

-- @everyone: lo cambia quien puede administrar roles, sin dar permisos que no tiene
create or replace function public.fogon_set_everyone_perms(p_server uuid, p_perms text[])
returns void language plpgsql security definer set search_path = '' as $$
declare cur text[]; mine text[];
begin
  if not public.fogon_has_perm(p_server, 'manage_roles') then raise exception 'No tenés permiso para cambiar @everyone.'; end if;
  p_perms := coalesce(p_perms, '{}');
  if not (p_perms <@ public.fogon_all_perms()) then raise exception 'Permiso desconocido.'; end if;
  select everyone_perms into cur from public.fogon_servers where id = p_server;
  mine := public.fogon_my_perms(p_server);
  if exists (select 1 from unnest(p_perms) x where not (x = any(cur)) and not (x = any(mine))) then
    raise exception 'No podés darle a @everyone un permiso que vos no tenés.';
  end if;
  update public.fogon_servers set everyone_perms = coalesce((select array_agg(distinct x) from unnest(p_perms) x), '{}') where id = p_server;
end $$;
revoke execute on function public.fogon_set_everyone_perms(uuid, text[]) from public, anon;
grant execute on function public.fogon_set_everyone_perms(uuid, text[]) to authenticated;

-- silenciar / ensordecer en el servidor (como Discord): vale en todos los canales de voz del servidor
create table if not exists public.fogon_voice_mods (
  server_id uuid not null references public.fogon_servers (id) on delete cascade,
  user_id uuid not null references public.fogon_profiles (id) on delete cascade,
  muted boolean not null default false,
  deafened boolean not null default false,
  by_id uuid references public.fogon_profiles (id) on delete set null,
  at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.fogon_voice_mods enable row level security;
revoke all on public.fogon_voice_mods from anon, authenticated;
grant select on public.fogon_voice_mods to authenticated;
create policy fogon_voice_mods_select on public.fogon_voice_mods for select to authenticated using (public.fogon_is_member(server_id));
alter publication supabase_realtime add table public.fogon_voice_mods;

create or replace function public.fogon_voice_mod(p_server uuid, p_user uuid, p_mute boolean, p_deafen boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bot boolean;
begin
  if p_mute is not null and not public.fogon_has_perm(p_server, 'mute_members') then raise exception 'No tenés permiso para silenciar miembros.'; end if;
  if p_deafen is not null and not public.fogon_has_perm(p_server, 'deafen_members') then raise exception 'No tenés permiso para ensordecer miembros.'; end if;
  select is_bot into v_bot from public.fogon_profiles where id = p_user;
  if v_bot is null then raise exception 'Esa persona no existe.'; end if;
  if not v_bot and p_user <> auth.uid() and not public.fogon_outranks(p_server, p_user) then
    raise exception 'No podés hacerle eso a alguien de tu mismo rango o más alto.';
  end if;
  if v_bot then
    update public.fogon_bot_voice set muted = coalesce(p_mute, muted), deafened = coalesce(p_deafen, deafened) where bot_id = p_user;
  end if;
  insert into public.fogon_voice_mods (server_id, user_id, muted, deafened, by_id, at)
  values (p_server, p_user, coalesce(p_mute, false), coalesce(p_deafen, false), auth.uid(), now())
  on conflict (server_id, user_id) do update set
    muted = coalesce(p_mute, public.fogon_voice_mods.muted),
    deafened = coalesce(p_deafen, public.fogon_voice_mods.deafened),
    by_id = auth.uid(), at = now();
end $$;
revoke execute on function public.fogon_voice_mod(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.fogon_voice_mod(uuid, uuid, boolean, boolean) to authenticated;

grant execute on function public.fogon_perms_of(uuid, uuid) to authenticated;
grant execute on function public.fogon_channel_allows_for(uuid, text, uuid) to authenticated;

-- el Equipo de Fogón ya tenía todo: ahora es Administrador (así sigue viendo los canales privados)
update public.fogon_roles set perms = public.fogon_all_perms() where id = '7c1d1f00-0000-4000-8000-00000000e001';
