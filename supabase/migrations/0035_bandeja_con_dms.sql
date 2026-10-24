-- La bandeja muestra también los MDs sin leer (como la Inbox de Discord), así coincide con el
-- numerito de la campanita: menciones de cualquier canal + mensajes directos que todavía no leíste.

create or replace function public.fogon_mentions(p_limit integer default 50)
returns table (
  id uuid, channel_id uuid, server_id uuid, channel_kind text, channel_name text,
  author_id uuid, author_name text, author_username text, content text, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  with leido as (
    select c.id, c.kind, coalesce(r.last_read_at, '-infinity'::timestamptz) as at
    from public.fogon_channels c
    left join public.fogon_read_states r on r.channel_id = c.id and r.user_id = auth.uid()
    where public.fogon_can_read(c.id)
  )
  select m.id, m.channel_id, c.server_id, c.kind, c.name,
         m.author_id, coalesce(p.display_name, p.username, 'Alguien'), p.username,
         left(m.content, 400), m.created_at
  from public.fogon_messages m
  join public.fogon_channels c on c.id = m.channel_id
  join leido l on l.id = m.channel_id
  left join public.fogon_profiles p on p.id = m.author_id
  where m.author_id <> auth.uid()
    and (auth.uid() = any(m.mentions) or (l.kind = 'dm' and m.created_at > l.at))
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke execute on function public.fogon_mentions(integer) from public, anon;
grant execute on function public.fogon_mentions(integer) to authenticated;
