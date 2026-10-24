-- "Radio Fogón": un bot que está 24/7 en el canal de voz "📻 Radio 24/7" pasando música sin parar
-- (de Audius, sin API key). Siempre aparece conectado; cuando entra alguien y la cola está por
-- terminarse, el navegador de quien está ahí busca más temas (cambia de género según la hora).

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000d001', 'radio.fogon', 'Radio Fogón', '#f23f43', '', '📻 al aire 24/7',
   'La radio del fogón 📻 Música sin parar, las 24 horas, en el canal de voz «📻 Radio 24/7».' || chr(10) || 'Entrá y escuchá. Podés pedir temas con !play.',
   'online', true, '#f23f43', '2026-10-22 18:00:00+00')
on conflict (id) do nothing;

insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values
  ('7c1d1f00-0000-4000-8000-00000000d002', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'voice', '📻 Radio 24/7', '', '7c1d1f00-0000-4000-8000-00000000c0a1', 2)
on conflict (id) do nothing;

-- la radio no charla, no juega, no se va
do $$
declare f text; def text;
begin
  foreach f in array array['public.fogon_bots_tick', 'public.fogon_bots_social', 'public.fogon_community_welcome', 'public.fogon_bot_on_message', 'public.fogon_sofi_hearts', 'public.fogon_bots_vote', 'public.fogon_music_reacts', 'public.fogon_music_opinion', 'public.fogon_bot_convo_start'] loop
    def := pg_get_functiondef(f::regproc);
    def := replace(def, '''temazo.dj''', '''temazo.dj'', ''radio.fogon''');
    execute def;
  end loop;
  def := pg_get_functiondef('public.fogon_bots_voice_tick'::regproc);
  def := replace(def, 'p.username <> ''temazo.dj'' loop', 'p.username not in (''temazo.dj'', ''radio.fogon'') loop');
  execute def;
  def := pg_get_functiondef('public.fogon_bot_voice_say'::regproc);
  def := replace(def, 'v.bot_id <> ''7c1d1f00-0000-4000-8000-00000000cf01''', 'v.bot_id not in (''7c1d1f00-0000-4000-8000-00000000cf01'', ''7c1d1f00-0000-4000-8000-00000000d001'')');
  execute def;
end $$;

insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000d001', '2026-10-22 18:00:00+00') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000d001', 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;

-- siempre conectada
insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, since, leave_at)
values ('7c1d1f00-0000-4000-8000-00000000d001', '7c1d1f00-0000-4000-8000-00000000d002', false, false, now(), 'infinity')
on conflict (bot_id) do update set channel_id = excluded.channel_id, leave_at = 'infinity', afk_until = null;

-- en la radio no entra Temazo (la radio es la que pasa música) y no se avisa cada tema en el chat
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_music_presence'::regproc);
  def := replace(def, '  select * into m from public.fogon_music where channel_id = p_channel;',
'  select * into m from public.fogon_music where channel_id = p_channel;
  if p_channel = ''7c1d1f00-0000-4000-8000-00000000d002'' then
    update public.fogon_profiles set custom_status = case when m.current is null then ''📻 al aire 24/7''
      else ''📻 '' || (m.current->>''title'') || '' — '' || (m.current->>''artist'') end
    where id = ''7c1d1f00-0000-4000-8000-00000000d001'';
    return;
  end if;');
  if position('d002' in def) = 0 then raise exception 'no pude ajustar fogon_music_presence'; end if;
  execute def;

  def := pg_get_functiondef('public.fogon_music_opinion'::regproc);
  def := replace(def, '  if p_track is null or random() < 0.2 then return; end if;',
                      '  if p_track is null or random() < 0.2 or p_voice = ''7c1d1f00-0000-4000-8000-00000000d002'' then return; end if;');
  execute def;

  -- la radio llena la cola sola: no más de 3 temas automáticos esperando
  def := pg_get_functiondef('public.fogon_music_add'::regproc);
  def := replace(def, '    if jsonb_array_length(m.queue) >= 50 then raise exception ''La cola está llena (50 temas)''; end if;',
'    if jsonb_array_length(m.queue) >= 50 then raise exception ''La cola está llena (50 temas)''; end if;
    if p_channel = ''7c1d1f00-0000-4000-8000-00000000d002'' and p_track->>''auto'' = ''1'' and jsonb_array_length(m.queue) >= 3 then return t; end if;
    if p_channel = ''7c1d1f00-0000-4000-8000-00000000d002'' and p_track->>''auto'' = ''1'' and exists (
      select 1 from jsonb_array_elements(m.queue) x where x->>''id'' = t->>''id'') then return t; end if;');
  if position('auto' in def) = 0 then raise exception 'no pude ajustar fogon_music_add'; end if;
  execute def;
end $$;

-- que la radio nunca "se apague por inactividad"
do $$
declare def text := pg_get_functiondef('public.fogon_music_tick'::regproc);
begin
  def := replace(def, 'where current is not null and updated_at < now() - interval ''3 hours'' loop',
                      'where current is not null and updated_at < now() - interval ''3 hours'' and channel_id <> ''7c1d1f00-0000-4000-8000-00000000d002'' loop');
  execute def;
end $$;
