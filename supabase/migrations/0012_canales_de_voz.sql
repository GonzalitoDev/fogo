-- Canales de voz: WebRTC entre los navegadores. La señalización y quién está conectado viajan por
-- canales privados de Realtime ("fogon-voice:<canal>") que solo pueden usar quienes ven ese canal.

alter table public.fogon_channels drop constraint fogon_channels_kind_check;
alter table public.fogon_channels add constraint fogon_channels_kind_check check (kind = any (array['text', 'category', 'dm', 'voice']));

create or replace function public.fogon_voice_topic_ok(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  if p_topic not like 'fogon-voice:%' then return false; end if;
  begin
    cid := split_part(p_topic, ':', 2)::uuid;
  exception when others then return false;
  end;
  return exists (select 1 from public.fogon_channels c where c.id = cid and c.kind = 'voice') and public.fogon_can_read(cid);
end $$;
revoke execute on function public.fogon_voice_topic_ok(text) from public, anon;
grant execute on function public.fogon_voice_topic_ok(text) to authenticated;

create policy fogon_voice_receive on realtime.messages for select to authenticated using (public.fogon_voice_topic_ok(realtime.topic()));
create policy fogon_voice_send on realtime.messages for insert to authenticated with check (public.fogon_voice_topic_ok(realtime.topic()));

-- la Comunidad de Fogón estrena dos canales de voz
insert into public.fogon_channels (id, server_id, kind, name, position)
values ('7c1d1f00-0000-4000-8000-00000000c0a1', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'category', 'CANALES DE VOZ', 3)
on conflict (id) do nothing;
insert into public.fogon_channels (id, server_id, kind, name, parent_id, position) values
  ('7c1d1f00-0000-4000-8000-00000000c0a2', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'voice', 'Fogón', '7c1d1f00-0000-4000-8000-00000000c0a1', 0),
  ('7c1d1f00-0000-4000-8000-00000000c0a3', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'voice', 'Gaming', '7c1d1f00-0000-4000-8000-00000000c0a1', 1)
on conflict (id) do nothing;
