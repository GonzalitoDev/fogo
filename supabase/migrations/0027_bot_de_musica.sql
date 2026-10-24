-- Bot de música "Temazo" para los canales de voz, sin API key: la música sale del catálogo abierto de
-- Audius (lo busca el navegador). La base guarda qué suena, desde cuándo y la cola, y todos los que
-- están en la llamada lo reproducen sincronizado. Comandos en cualquier canal de texto: !play, !skip,
-- !pausa, !sigue, !stop, !cola, !ahora.

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000cf01', 'temazo.dj', 'Temazo', '#1db954', '', '🎵 !play y lo que quieras escuchar',
   'Bot de música de Fogón 🎧' || chr(10) || 'Entrá a un canal de voz y escribí !play con el nombre de un tema. Música libre de Audius.',
   'online', true, '#1db954', '2026-10-22 18:00:00+00')
on conflict (id) do nothing;

-- Temazo no charla ni juega: solo pasa música
do $$
declare f text; def text;
begin
  foreach f in array array['public.fogon_bots_tick', 'public.fogon_bots_social', 'public.fogon_community_welcome', 'public.fogon_bot_on_message', 'public.fogon_sofi_hearts', 'public.fogon_bots_vote'] loop
    def := pg_get_functiondef(f::regproc);
    def := replace(def, '''modmail''', '''modmail'', ''temazo.dj''');
    execute def;
  end loop;
end $$;

insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cf01', '2026-10-22 18:00:00+00') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cf01', 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;

create table if not exists public.fogon_music (
  channel_id uuid primary key references public.fogon_channels(id) on delete cascade,
  current jsonb,                 -- {id, title, artist, art, duration, by}
  started_at timestamptz,
  paused_at timestamptz,
  queue jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.fogon_music enable row level security;
create policy fogon_music_read on public.fogon_music for select to authenticated using (public.fogon_can_read(channel_id));
grant select on public.fogon_music to authenticated;
alter publication supabase_realtime add table public.fogon_music;

/* ---------- helpers ---------- */

create or replace function public.fogon_music_say(p_text_channel uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_text_channel is null then return; end if;
  if not exists (select 1 from public.fogon_channels where id = p_text_channel and kind in ('text', 'dm')) then return; end if;
  if auth.uid() is not null and not public.fogon_can_read(p_text_channel) then return; end if;
  perform public.fogon_bot_enqueue(p_text_channel, '7c1d1f00-0000-4000-8000-00000000cf01', p_body, null, interval '0.5 seconds');
end $$;

-- el bot aparece en la llamada mientras suena algo
create or replace function public.fogon_music_presence(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare dj uuid := '7c1d1f00-0000-4000-8000-00000000cf01'; m public.fogon_music;
begin
  select * into m from public.fogon_music where channel_id = p_channel;
  if m.current is not null then
    insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, since, leave_at)
    values (dj, p_channel, false, false, now(), now() + interval '30 days')
    on conflict (bot_id) do update set channel_id = p_channel, muted = false, deafened = false, leave_at = now() + interval '30 days', afk_until = null;
    update public.fogon_profiles set custom_status = case when m.paused_at is not null then '⏸️ ' else '🎵 ' end || (m.current->>'title') || ' — ' || (m.current->>'artist') where id = dj;
  elsif exists (select 1 from public.fogon_bot_voice where bot_id = dj and channel_id = p_channel) then
    update public.fogon_bot_voice set channel_id = null, left_at = now(), leave_at = null where bot_id = dj;
    update public.fogon_profiles set custom_status = '🎵 !play y lo que quieras escuchar' where id = dj;
  end if;
end $$;

create or replace function public.fogon_music_check(p_channel uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if not exists (select 1 from public.fogon_channels where id = p_channel and kind = 'voice') then raise exception 'Eso no es un canal de voz'; end if;
  if not public.fogon_can_read(p_channel) then raise exception 'No tenés acceso a ese canal de voz' using errcode = '42501'; end if;
end $$;

/* ---------- comandos ---------- */

create or replace function public.fogon_music_add(p_channel uuid, p_track jsonb, p_text_channel uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.fogon_music; t jsonb; v_user text;
begin
  perform public.fogon_music_check(p_channel);
  if p_track->>'id' is null or p_track->>'title' is null then raise exception 'Tema inválido'; end if;
  select username into v_user from public.fogon_profiles where id = auth.uid();
  t := jsonb_build_object('id', left(p_track->>'id', 40), 'title', left(p_track->>'title', 120), 'artist', left(coalesce(p_track->>'artist', ''), 80),
                          'art', left(coalesce(p_track->>'art', ''), 300), 'duration', coalesce((p_track->>'duration')::int, 0), 'by', v_user);
  insert into public.fogon_music (channel_id) values (p_channel) on conflict do nothing;
  select * into m from public.fogon_music where channel_id = p_channel for update;
  if m.current is null then
    update public.fogon_music set current = t, started_at = now(), paused_at = null, updated_at = now() where channel_id = p_channel;
    perform public.fogon_music_say(p_text_channel, '🎵 Suena **' || (t->>'title') || '** — ' || (t->>'artist') || ' (pedido por @' || v_user || ')');
  else
    if jsonb_array_length(m.queue) >= 50 then raise exception 'La cola está llena (50 temas)'; end if;
    update public.fogon_music set queue = queue || jsonb_build_array(t), updated_at = now() where channel_id = p_channel;
    perform public.fogon_music_say(p_text_channel, '➕ En la cola (#' || (jsonb_array_length(m.queue) + 1) || '): **' || (t->>'title') || '** — ' || (t->>'artist'));
  end if;
  perform public.fogon_music_presence(p_channel);
  return t;
end $$;

-- pasa al siguiente. Si p_from viene, solo avanza si todavía suena ese (así varios clientes no saltean de más)
create or replace function public.fogon_music_next(p_channel uuid, p_from text default null, p_text_channel uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.fogon_music; nxt jsonb;
begin
  if auth.uid() is not null then perform public.fogon_music_check(p_channel); end if;
  select * into m from public.fogon_music where channel_id = p_channel for update;
  if m.current is null then return; end if;
  if p_from is not null and m.current->>'id' is distinct from p_from then return; end if;
  nxt := m.queue->0;
  update public.fogon_music set current = nxt, started_at = case when nxt is null then null else now() end, paused_at = null,
    queue = case when jsonb_array_length(queue) > 0 then queue - 0 else '[]'::jsonb end, updated_at = now()
  where channel_id = p_channel;
  if p_text_channel is not null then
    perform public.fogon_music_say(p_text_channel, case when nxt is null then '⏹️ Se terminó la cola. Pedí más con !play' else '⏭️ Ahora: **' || (nxt->>'title') || '** — ' || (nxt->>'artist') end);
  end if;
  perform public.fogon_music_presence(p_channel);
end $$;

create or replace function public.fogon_music_pause(p_channel uuid, p_pause boolean, p_text_channel uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.fogon_music;
begin
  perform public.fogon_music_check(p_channel);
  select * into m from public.fogon_music where channel_id = p_channel for update;
  if m.current is null then return; end if;
  if p_pause and m.paused_at is null then
    update public.fogon_music set paused_at = now(), updated_at = now() where channel_id = p_channel;
    perform public.fogon_music_say(p_text_channel, '⏸️ Pausado.');
  elsif not p_pause and m.paused_at is not null then
    update public.fogon_music set started_at = started_at + (now() - paused_at), paused_at = null, updated_at = now() where channel_id = p_channel;
    perform public.fogon_music_say(p_text_channel, '▶️ Sigue sonando **' || (m.current->>'title') || '**.');
  end if;
  perform public.fogon_music_presence(p_channel);
end $$;

create or replace function public.fogon_music_stop(p_channel uuid, p_text_channel uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fogon_music_check(p_channel);
  update public.fogon_music set current = null, started_at = null, paused_at = null, queue = '[]'::jsonb, updated_at = now() where channel_id = p_channel;
  perform public.fogon_music_say(p_text_channel, '⏹️ Listo, apagué la música. ¡Nos vemos! 👋');
  perform public.fogon_music_presence(p_channel);
end $$;

create or replace function public.fogon_music_info(p_channel uuid, p_text_channel uuid, p_what text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.fogon_music; v_body text; i int;
begin
  perform public.fogon_music_check(p_channel);
  select * into m from public.fogon_music where channel_id = p_channel;
  if m.current is null then
    v_body := '🔇 No está sonando nada. Pedí un tema con **!play nombre del tema**';
  elsif p_what = 'ahora' then
    v_body := '🎧 Sonando: **' || (m.current->>'title') || '** — ' || (m.current->>'artist') || ' (pedido por @' || (m.current->>'by') || ')';
  else
    v_body := '🎧 **Ahora:** ' || (m.current->>'title') || ' — ' || (m.current->>'artist');
    if jsonb_array_length(m.queue) = 0 then
      v_body := v_body || chr(10) || 'La cola está vacía.';
    else
      for i in 0 .. least(jsonb_array_length(m.queue), 10) - 1 loop
        v_body := v_body || chr(10) || (i + 1) || '. ' || (m.queue->i->>'title') || ' — ' || (m.queue->i->>'artist');
      end loop;
      if jsonb_array_length(m.queue) > 10 then v_body := v_body || chr(10) || '… y ' || (jsonb_array_length(m.queue) - 10) || ' más'; end if;
    end if;
  end if;
  perform public.fogon_music_say(p_text_channel, v_body);
end $$;

-- por si nadie de la llamada avisó que terminó el tema
create or replace function public.fogon_music_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select * from public.fogon_music where current is not null and paused_at is null
    and started_at + make_interval(secs => greatest(coalesce((current->>'duration')::int, 0), 30) + 8) < now() loop
    perform public.fogon_music_next(m.channel_id, m.current->>'id', null);
  end loop;
  -- si no queda nadie en la llamada un rato, se apaga
  for m in select * from public.fogon_music where current is not null and updated_at < now() - interval '3 hours' loop
    update public.fogon_music set current = null, started_at = null, paused_at = null, queue = '[]'::jsonb, updated_at = now() where channel_id = m.channel_id;
    perform public.fogon_music_presence(m.channel_id);
  end loop;
end $$;
select cron.schedule('fogon-musica', '* * * * *', 'select public.fogon_music_tick()');

revoke execute on function public.fogon_music_say(uuid, text) from public, anon, authenticated;
revoke execute on function public.fogon_music_presence(uuid) from public, anon, authenticated;
revoke execute on function public.fogon_music_tick() from public, anon, authenticated;
revoke execute on function public.fogon_music_check(uuid) from public, anon;
revoke execute on function public.fogon_music_add(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.fogon_music_next(uuid, text, uuid) from public, anon;
revoke execute on function public.fogon_music_pause(uuid, boolean, uuid) from public, anon;
revoke execute on function public.fogon_music_stop(uuid, uuid) from public, anon;
revoke execute on function public.fogon_music_info(uuid, uuid, text) from public, anon;
grant execute on function public.fogon_music_add(uuid, jsonb, uuid) to authenticated;
grant execute on function public.fogon_music_next(uuid, text, uuid) to authenticated;
grant execute on function public.fogon_music_pause(uuid, boolean, uuid) to authenticated;
grant execute on function public.fogon_music_stop(uuid, uuid) to authenticated;
grant execute on function public.fogon_music_info(uuid, uuid, text) to authenticated;

-- en la llamada, Temazo no se va AFK ni contesta por voz (solo pasa música)
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_bots_voice_tick'::regproc);
  def := replace(def, 'for b in select v.*, p.username from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id where v.channel_id is not null loop',
                      'for b in select v.*, p.username from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id where v.channel_id is not null and p.username <> ''temazo.dj'' loop');
  if position('temazo.dj' in def) = 0 then raise exception 'no pude ajustar fogon_bots_voice_tick'; end if;
  execute def;
  def := pg_get_functiondef('public.fogon_bot_voice_say'::regproc);
  def := replace(def, 'where v.channel_id = p_channel and v.afk_until is null order by random() limit 1;',
                      'where v.channel_id = p_channel and v.afk_until is null and v.bot_id <> ''7c1d1f00-0000-4000-8000-00000000cf01'' order by random() limit 1;');
  def := replace(def, 'where v.channel_id = p_channel and v.afk_until is null
    and (', 'where v.channel_id = p_channel and v.afk_until is null and v.bot_id <> ''7c1d1f00-0000-4000-8000-00000000cf01''
    and (');
  execute def;
end $$;
