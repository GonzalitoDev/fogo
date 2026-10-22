-- Menciones: misma regla que el cliente (empieza una palabra, no termina en punto: "@beto." menciona a beto)
create or replace function public.fogon_messages_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ch public.fogon_channels;
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
