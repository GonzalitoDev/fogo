-- Baneos por servidor (permiso nuevo "ban_members") y roles que se dan solos a los miembros nuevos.

-- permiso nuevo
alter table public.fogon_roles drop constraint fogon_roles_perms_check;
alter table public.fogon_roles add constraint fogon_roles_perms_check
  check (perms <@ array['manage_server','manage_channels','manage_roles','manage_messages','kick_members','ban_members','mention_everyone']::text[]);

create or replace function public.fogon_my_perms(p_server uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select case when public.fogon_is_owner(p_server)
    then array['manage_server','manage_channels','manage_roles','manage_messages','kick_members','ban_members','mention_everyone']::text[]
    else coalesce((select array_agg(distinct x) from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id, unnest(r.perms) x
                   where mr.server_id = p_server and mr.user_id = auth.uid()), '{}')
  end;
$$;

-- roles automáticos
alter table public.fogon_roles add column auto_assign boolean not null default false;
grant update (auto_assign) on public.fogon_roles to authenticated;

-- baneos
create table public.fogon_bans (
  server_id uuid not null references public.fogon_servers(id) on delete cascade,
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  reason text not null default '' check (length(reason) <= 200),
  banned_by uuid references public.fogon_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.fogon_bans enable row level security;
revoke all on public.fogon_bans from anon;
revoke insert, update on public.fogon_bans from authenticated;
create policy fogon_bans_select on public.fogon_bans for select to authenticated using (public.fogon_has_perm(server_id, 'ban_members'));
create policy fogon_bans_delete on public.fogon_bans for delete to authenticated using (public.fogon_has_perm(server_id, 'ban_members'));

-- banear: saca del servidor, impide volver y (opcional) borra sus mensajes recientes
create or replace function public.fogon_ban(p_server uuid, p_user uuid, p_reason text default '', p_delete_hours int default 0)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_has_perm(p_server, 'ban_members') then raise exception 'No tenés permiso para banear' using errcode = '42501'; end if;
  if not public.fogon_outranks(p_server, p_user) then raise exception 'No podés banear a alguien con un rol igual o más alto que el tuyo' using errcode = '42501'; end if;
  if p_delete_hours not in (0, 1, 24, 168) then raise exception 'Opción inválida'; end if;
  insert into public.fogon_bans (server_id, user_id, reason, banned_by)
  values (p_server, p_user, left(coalesce(p_reason, ''), 200), auth.uid())
  on conflict (server_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  delete from public.fogon_members where server_id = p_server and user_id = p_user;
  if p_delete_hours > 0 then
    delete from public.fogon_messages m using public.fogon_channels c
    where c.id = m.channel_id and c.server_id = p_server and m.author_id = p_user
      and m.created_at > now() - make_interval(hours => p_delete_hours);
  end if;
end $$;

-- unirse: rechaza a los baneados y da los roles automáticos
create or replace function public.fogon_join_server(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  added int;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if not exists (select 1 from public.fogon_profiles where id = auth.uid()) then raise exception 'Completá tu perfil primero'; end if;
  select id into sid from public.fogon_servers where invite_code = p_code;
  if sid is null then raise exception 'La invitación no es válida o ya no existe'; end if;
  if exists (select 1 from public.fogon_bans b where b.server_id = sid and b.user_id = auth.uid()) then
    raise exception 'Estás baneado de este servidor' using errcode = '42501';
  end if;
  insert into public.fogon_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    insert into public.fogon_member_roles (server_id, user_id, role_id)
    select sid, auth.uid(), r.id from public.fogon_roles r where r.server_id = sid and r.auto_assign
    on conflict do nothing;
  end if;
  return sid;
end $$;

revoke execute on function public.fogon_ban(uuid, uuid, text, int) from public, anon;
grant execute on function public.fogon_ban(uuid, uuid, text, int) to authenticated;

alter publication supabase_realtime add table public.fogon_bans;
