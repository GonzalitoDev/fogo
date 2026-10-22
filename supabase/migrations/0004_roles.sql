-- Roles por servidor con permisos. El dueño siempre tiene todos.
-- Jerarquía: quien no es dueño solo puede tocar roles (y gente) por debajo de su rol más alto.

create table public.fogon_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.fogon_servers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 50),
  color text not null default '#99a8a4' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 1 check (position between 1 and 999),
  hoist boolean not null default true,
  perms text[] not null default '{}' check (perms <@ array['manage_server','manage_channels','manage_roles','manage_messages','kick_members','mention_everyone']::text[]),
  created_at timestamptz not null default now(),
  unique (id, server_id)
);
create index on public.fogon_roles (server_id, position desc);

create table public.fogon_member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  primary key (user_id, role_id),
  foreign key (server_id, user_id) references public.fogon_members(server_id, user_id) on delete cascade,
  foreign key (role_id, server_id) references public.fogon_roles(id, server_id) on delete cascade
);
create index on public.fogon_member_roles (server_id);
create index on public.fogon_member_roles (role_id);

-- ---------- helpers ----------

create or replace function public.fogon_top_position(p_server uuid, p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.fogon_servers s where s.id = p_server and s.owner_id = p_user) then 1000
    else coalesce((select max(r.position) from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id
                   where mr.server_id = p_server and mr.user_id = p_user), 0)
  end;
$$;

create or replace function public.fogon_has_perm(p_server uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fogon_is_owner(p_server)
    or exists (
      select 1 from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id
      where mr.server_id = p_server and mr.user_id = auth.uid() and p_perm = any(r.perms)
    );
$$;

-- permisos propios (el dueño: todos)
create or replace function public.fogon_my_perms(p_server uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case when public.fogon_is_owner(p_server)
    then array['manage_server','manage_channels','manage_roles','manage_messages','kick_members','mention_everyone']::text[]
    else coalesce((select array_agg(distinct x) from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id, unnest(r.perms) x
                   where mr.server_id = p_server and mr.user_id = auth.uid()), '{}')
  end;
$$;

-- puede gestionar un rol de esa posición (dueño: cualquiera; resto: por debajo de su rol más alto)
create or replace function public.fogon_can_manage_role(p_server uuid, p_position int)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.fogon_has_perm(p_server, 'manage_roles')
    and p_position < public.fogon_top_position(p_server, auth.uid());
$$;

-- puede actuar sobre otro miembro (echar): no al dueño y solo si está por debajo
create or replace function public.fogon_outranks(p_server uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user <> auth.uid()
    and not exists (select 1 from public.fogon_servers s where s.id = p_server and s.owner_id = p_user)
    and public.fogon_top_position(p_server, auth.uid()) > public.fogon_top_position(p_server, p_user);
$$;

revoke execute on function public.fogon_top_position(uuid, uuid), public.fogon_has_perm(uuid, text), public.fogon_my_perms(uuid),
  public.fogon_can_manage_role(uuid, int), public.fogon_outranks(uuid, uuid) from public, anon;
grant execute on function public.fogon_top_position(uuid, uuid), public.fogon_has_perm(uuid, text), public.fogon_my_perms(uuid),
  public.fogon_can_manage_role(uuid, int), public.fogon_outranks(uuid, uuid) to authenticated;

-- ---------- RLS de las tablas nuevas ----------

alter table public.fogon_roles enable row level security;
alter table public.fogon_member_roles enable row level security;

create policy fogon_roles_select on public.fogon_roles for select to authenticated using (public.fogon_is_member(server_id));
create policy fogon_roles_insert on public.fogon_roles for insert to authenticated
  with check (public.fogon_can_manage_role(server_id, position) and perms <@ public.fogon_my_perms(server_id));
create policy fogon_roles_update on public.fogon_roles for update to authenticated
  using (public.fogon_can_manage_role(server_id, position))
  with check (public.fogon_can_manage_role(server_id, position) and perms <@ public.fogon_my_perms(server_id));
create policy fogon_roles_delete on public.fogon_roles for delete to authenticated using (public.fogon_can_manage_role(server_id, position));

create policy fogon_member_roles_select on public.fogon_member_roles for select to authenticated using (public.fogon_is_member(server_id));
create policy fogon_member_roles_insert on public.fogon_member_roles for insert to authenticated with check (
  exists (select 1 from public.fogon_roles r where r.id = role_id and r.server_id = fogon_member_roles.server_id and public.fogon_can_manage_role(r.server_id, r.position))
);
create policy fogon_member_roles_delete on public.fogon_member_roles for delete to authenticated using (
  exists (select 1 from public.fogon_roles r where r.id = role_id and public.fogon_can_manage_role(r.server_id, r.position))
);

revoke update on public.fogon_roles from anon, authenticated;
grant update (name, color, position, hoist, perms) on public.fogon_roles to authenticated;
revoke all on public.fogon_roles, public.fogon_member_roles from anon;
revoke update on public.fogon_member_roles from authenticated;

-- ---------- las reglas existentes pasan a usar permisos ----------

alter policy fogon_channels_insert on public.fogon_channels
  with check (kind <> 'dm' and public.fogon_has_perm(server_id, 'manage_channels'));
alter policy fogon_channels_update on public.fogon_channels
  using (kind <> 'dm' and public.fogon_has_perm(server_id, 'manage_channels'))
  with check (kind <> 'dm' and public.fogon_has_perm(server_id, 'manage_channels'));
alter policy fogon_channels_delete on public.fogon_channels
  using (kind <> 'dm' and public.fogon_has_perm(server_id, 'manage_channels'));

-- leer canales por las columnas de la fila (así INSERT ... RETURNING también funciona)
create or replace function public.fogon_is_dm_participant(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_dm_participants d where d.channel_id = p_channel and d.user_id = auth.uid());
$$;
revoke execute on function public.fogon_is_dm_participant(uuid) from public, anon;
grant execute on function public.fogon_is_dm_participant(uuid) to authenticated;
alter policy fogon_channels_select on public.fogon_channels
  using ((kind <> 'dm' and public.fogon_is_member(server_id)) or (kind = 'dm' and public.fogon_is_dm_participant(id)));

alter policy fogon_messages_delete on public.fogon_messages using (
  author_id = (select auth.uid())
  or exists (select 1 from public.fogon_channels c where c.id = channel_id and c.server_id is not null and public.fogon_has_perm(c.server_id, 'manage_messages'))
);

alter policy fogon_members_delete on public.fogon_members using (
  (user_id = (select auth.uid()) and not public.fogon_is_owner(server_id))
  or (public.fogon_has_perm(server_id, 'kick_members') and public.fogon_outranks(server_id, user_id))
);

alter policy fogon_servers_update on public.fogon_servers
  using (public.fogon_has_perm(id, 'manage_server')) with check (public.fogon_has_perm(id, 'manage_server'));

create or replace function public.fogon_reset_invite(p_server uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.fogon_has_perm(p_server, 'manage_server') then raise exception 'No tenés permiso para cambiar la invitación'; end if;
  update public.fogon_servers set invite_code = substr(md5(gen_random_uuid()::text), 1, 10) where id = p_server returning invite_code into code;
  return code;
end $$;

-- @everyone: avisa a todos los miembros si el autor tiene el permiso
create or replace function public.fogon_messages_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ch public.fogon_channels;
  can_everyone boolean;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content then
      new.edited_at := now();
    end if;
    new.author_id := old.author_id;
    new.channel_id := old.channel_id;
    new.created_at := old.created_at;
    new.reply_to_id := old.reply_to_id;
    new.attachments := old.attachments;
  else
    new.created_at := now();
    new.edited_at := null;
  end if;

  select * into ch from public.fogon_channels where id = new.channel_id;
  can_everyone := ch.kind <> 'dm'
    and new.content ~ '(^|[^A-Za-z0-9_.])@everyone([^A-Za-z0-9_]|$)'
    and (exists (select 1 from public.fogon_servers s where s.id = ch.server_id and s.owner_id = new.author_id)
         or exists (select 1 from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id
                    where mr.server_id = ch.server_id and mr.user_id = new.author_id and 'mention_everyone' = any(r.perms)));

  if can_everyone then
    new.mentions := coalesce((select array_agg(m.user_id) from public.fogon_members m where m.server_id = ch.server_id and m.user_id <> new.author_id), '{}');
    return new;
  end if;

  new.mentions := coalesce((
    select array_agg(distinct p.id)
    from regexp_matches(new.content, '(?:^|[^A-Za-z0-9_.])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,30}[A-Za-z0-9_])?)', 'g') as m(arr)
    join public.fogon_profiles p on p.username = lower(m.arr[1])
    where p.id <> new.author_id
      and (
        (ch.kind = 'dm' and exists (select 1 from public.fogon_dm_participants d where d.channel_id = ch.id and d.user_id = p.id))
        or (ch.kind <> 'dm' and exists (select 1 from public.fogon_members mm where mm.server_id = ch.server_id and mm.user_id = p.id))
      )
  ), '{}');
  return new;
end $$;
revoke execute on function public.fogon_messages_before() from public, anon, authenticated;

alter publication supabase_realtime add table public.fogon_roles, public.fogon_member_roles;
