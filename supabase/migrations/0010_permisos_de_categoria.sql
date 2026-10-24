-- Permisos por categoría y por canal, como en Discord: para @everyone o para un rol,
-- cada permiso puede estar permitido, denegado o heredado.

create table public.fogon_channel_overrides (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.fogon_servers(id) on delete cascade,
  channel_id uuid not null references public.fogon_channels(id) on delete cascade,
  role_id uuid references public.fogon_roles(id) on delete cascade, -- null = @everyone
  allow text[] not null default '{}' check (allow <@ array['view_channel','send_messages','add_reactions','attach_files']::text[]),
  deny text[] not null default '{}' check (deny <@ array['view_channel','send_messages','add_reactions','attach_files']::text[]),
  check (not (allow && deny))
);
create unique index fogon_channel_overrides_target on public.fogon_channel_overrides (channel_id, coalesce(role_id, '00000000-0000-0000-0000-000000000000'));
create index on public.fogon_channel_overrides (server_id);

-- ¿El usuario actual tiene ese permiso en el canal? Dueño y quien administra canales, siempre.
-- Orden: categoría y después el canal; en cada nivel primero @everyone y después los roles
-- (si un rol permite, gana sobre otro rol que deniega).
create or replace function public.fogon_channel_allows(p_channel uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  c record;
  lvl uuid;
  ok boolean := true;
  ev record;
  r_allow boolean;
  r_deny boolean;
begin
  select id, server_id, parent_id, kind into c from public.fogon_channels where id = p_channel;
  if c.id is null then return false; end if;
  if c.kind = 'dm' then return true; end if;
  if public.fogon_is_owner(c.server_id) or public.fogon_has_perm(c.server_id, 'manage_channels') then return true; end if;
  foreach lvl in array array_remove(array[c.parent_id, c.id], null) loop
    select allow, deny into ev from public.fogon_channel_overrides where channel_id = lvl and role_id is null;
    if found then
      if p_perm = any(ev.deny) then ok := false; end if;
      if p_perm = any(ev.allow) then ok := true; end if;
    end if;
    select bool_or(p_perm = any(o.allow)), bool_or(p_perm = any(o.deny)) into r_allow, r_deny
    from public.fogon_channel_overrides o
    join public.fogon_member_roles mr on mr.role_id = o.role_id and mr.user_id = auth.uid()
    where o.channel_id = lvl;
    if r_deny then ok := false; end if;
    if r_allow then ok := true; end if;
  end loop;
  -- sin ver el canal no se puede hacer nada más
  if p_perm <> 'view_channel' and ok then
    return public.fogon_channel_allows(p_channel, 'view_channel');
  end if;
  return ok;
end $$;

revoke execute on function public.fogon_channel_allows(uuid, text) from public, anon;
grant execute on function public.fogon_channel_allows(uuid, text) to authenticated;

alter table public.fogon_channel_overrides enable row level security;
revoke all on public.fogon_channel_overrides from anon;
create policy fogon_overrides_select on public.fogon_channel_overrides for select to authenticated using (public.fogon_is_member(server_id));
create policy fogon_overrides_insert on public.fogon_channel_overrides for insert to authenticated with check (
  public.fogon_has_perm(server_id, 'manage_channels')
  and exists (select 1 from public.fogon_channels c where c.id = channel_id and c.server_id = fogon_channel_overrides.server_id)
  and (role_id is null or exists (select 1 from public.fogon_roles r where r.id = role_id and r.server_id = fogon_channel_overrides.server_id))
);
create policy fogon_overrides_update on public.fogon_channel_overrides for update to authenticated
  using (public.fogon_has_perm(server_id, 'manage_channels')) with check (public.fogon_has_perm(server_id, 'manage_channels'));
create policy fogon_overrides_delete on public.fogon_channel_overrides for delete to authenticated using (public.fogon_has_perm(server_id, 'manage_channels'));
revoke update on public.fogon_channel_overrides from authenticated;
grant update (allow, deny) on public.fogon_channel_overrides to authenticated;

-- leer: además de ser miembro, poder ver el canal
create or replace function public.fogon_can_read(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fogon_channels c
    where c.id = p_channel
      and (
        (c.kind = 'dm' and exists (select 1 from public.fogon_dm_participants d where d.channel_id = c.id and d.user_id = auth.uid()))
        or (c.kind <> 'dm' and exists (select 1 from public.fogon_members m where m.server_id = c.server_id and m.user_id = auth.uid())
            and public.fogon_channel_allows(c.id, 'view_channel'))
      )
  );
$$;

alter policy fogon_channels_select on public.fogon_channels
  using ((kind <> 'dm' and public.fogon_is_member(server_id) and public.fogon_channel_allows(id, 'view_channel')) or (kind = 'dm' and public.fogon_is_dm_participant(id)));

alter policy fogon_messages_insert on public.fogon_messages with check (
  author_id = (select auth.uid()) and public.fogon_can_read(channel_id)
  and exists (select 1 from public.fogon_channels c where c.id = fogon_messages.channel_id and c.kind = any (array['text', 'dm']))
  and public.fogon_channel_allows(channel_id, 'send_messages')
  and (jsonb_array_length(attachments) = 0 or public.fogon_channel_allows(channel_id, 'attach_files'))
);

alter policy fogon_reactions_insert on public.fogon_reactions with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.fogon_messages m where m.id = fogon_reactions.message_id and public.fogon_can_read(m.channel_id) and public.fogon_channel_allows(m.channel_id, 'add_reactions'))
);

alter publication supabase_realtime add table public.fogon_channel_overrides;
