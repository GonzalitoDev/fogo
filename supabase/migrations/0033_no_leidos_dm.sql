-- No leídos más justos: cuentan los mensajes de los demás después de tu último leído, no
-- "el canal cambió desde que lo leíste". Así, si contestás un DM, no te queda como no leído.

create or replace function public.fogon_unread()
returns table (channel_id uuid, unread boolean, mentions bigint)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select c.id, c.kind from public.fogon_channels c
    join public.fogon_members m on m.server_id = c.server_id and m.user_id = auth.uid()
    where c.kind = 'text'
    union all
    select c.id, c.kind from public.fogon_channels c
    join public.fogon_dm_participants d on d.channel_id = c.id and d.user_id = auth.uid()
  ),
  leido as (
    select v.id, v.kind, coalesce(r.last_read_at, '-infinity'::timestamptz) as at
    from visible v
    left join public.fogon_read_states r on r.channel_id = v.id and r.user_id = auth.uid()
  ),
  nuevos as (
    select l.id,
           count(*) as total,
           count(*) filter (where l.kind = 'dm' or auth.uid() = any(msg.mentions)) as mentions
    from leido l
    join public.fogon_messages msg on msg.channel_id = l.id and msg.created_at > l.at and msg.author_id <> auth.uid()
    group by l.id
  )
  select l.id,
         coalesce(n.total, 0) > 0,
         coalesce(n.mentions, 0)
  from leido l
  left join nuevos n on n.id = l.id;
$$;
revoke execute on function public.fogon_unread() from public, anon;
grant execute on function public.fogon_unread() to authenticated;
