-- Opciones tipo Discord: marcar todo como leído y bandeja de menciones.

-- 1) Marcar como leído todos los canales de texto de un servidor (o todos los DMs si p_server es null).
create or replace function public.fogon_mark_read_all(p_server uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  with canales as (
    select c.id from public.fogon_channels c
    where (p_server is null and c.kind = 'dm'
            and exists (select 1 from public.fogon_dm_participants d where d.channel_id = c.id and d.user_id = auth.uid()))
       or (p_server is not null and c.server_id = p_server and c.kind = 'text'
            and exists (select 1 from public.fogon_members m where m.server_id = p_server and m.user_id = auth.uid()))
  ), guardados as (
    insert into public.fogon_read_states (user_id, channel_id, last_read_at)
    select auth.uid(), id, now() from canales
    on conflict (user_id, channel_id) do update set last_read_at = now()
    returning 1
  )
  select count(*) into n from guardados;
  return n;
end $$;
revoke execute on function public.fogon_mark_read_all(uuid) from public, anon;
grant execute on function public.fogon_mark_read_all(uuid) to authenticated;

-- 2) Bandeja de menciones: los mensajes donde te nombraron, de todos los canales que podés ver.
create or replace function public.fogon_mentions(p_limit integer default 50)
returns table (
  id uuid, channel_id uuid, server_id uuid, channel_kind text, channel_name text,
  author_id uuid, author_name text, author_username text, content text, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select m.id, m.channel_id, c.server_id, c.kind, c.name,
         m.author_id, coalesce(p.display_name, p.username, 'Alguien'), p.username,
         left(m.content, 400), m.created_at
  from public.fogon_messages m
  join public.fogon_channels c on c.id = m.channel_id
  left join public.fogon_profiles p on p.id = m.author_id
  where auth.uid() = any(m.mentions)
    and m.author_id <> auth.uid()
    and public.fogon_can_read(m.channel_id)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke execute on function public.fogon_mentions(integer) from public, anon;
grant execute on function public.fogon_mentions(integer) to authenticated;
