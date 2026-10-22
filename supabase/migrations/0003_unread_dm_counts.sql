-- En los DMs cuenta cada mensaje sin leer del otro (como Discord); en canales, solo las menciones
create or replace function public.fogon_unread()
returns table (channel_id uuid, unread boolean, mentions bigint)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select c.id, c.kind, c.last_message_at from public.fogon_channels c
    join public.fogon_members m on m.server_id = c.server_id and m.user_id = auth.uid()
    where c.kind = 'text'
    union all
    select c.id, c.kind, c.last_message_at from public.fogon_channels c
    join public.fogon_dm_participants d on d.channel_id = c.id and d.user_id = auth.uid()
  )
  select v.id,
         v.last_message_at is not null and v.last_message_at > coalesce(r.last_read_at, '-infinity'),
         (select count(*) from public.fogon_messages msg
           where msg.channel_id = v.id and msg.created_at > coalesce(r.last_read_at, '-infinity')
             and msg.author_id <> auth.uid()
             and (v.kind = 'dm' or auth.uid() = any(msg.mentions)))
  from visible v
  left join public.fogon_read_states r on r.channel_id = v.id and r.user_id = auth.uid();
$$;
revoke execute on function public.fogon_unread() from public, anon;
grant execute on function public.fogon_unread() to authenticated;
