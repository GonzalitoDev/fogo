-- Los bots entran a los canales de voz cuando "quieren": cada uno tiene sus horarios preferidos,
-- se suman más si ya hay gente, se van a buscar algo y vuelven (AFK), cambian de juego y charlan
-- un poco en #vc. Siguen con el micrófono apagado (no tienen voz) y con la etiqueta BOT.

alter table public.fogon_bot_voice add column if not exists afk_until timestamptz;
alter table public.fogon_bot_voice add column if not exists left_at timestamptz;

create table if not exists public.fogon_bot_habits (
  username text primary key,
  room text not null check (room in ('gaming', 'fogon')),
  hours int[] not null,      -- horas en las que le gusta conectarse
  social numeric not null default 1 -- cuánto lo atrae que ya haya gente
);
alter table public.fogon_bot_habits enable row level security;
insert into public.fogon_bot_habits (username, room, hours, social) values
  ('tincho_gamer', 'gaming', array[15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1], 1),
  ('santi_futbol', 'gaming', array[18, 19, 20, 21, 22, 23], 1.5),
  ('juli.memes',   'gaming', array[13, 14, 20, 21, 22, 23, 0], 2),
  ('nacho.dev',    'gaming', array[21, 22, 23, 0], 1),
  ('patooo',       'gaming', array[0, 1, 2, 3, 4, 5, 23], 0.5),
  ('valeee',       'fogon',  array[22, 23, 0, 1, 12, 13], 1.5),
  ('lucho.mate',   'fogon',  array[9, 10, 11, 17, 18, 19, 20], 1),
  ('ro.musica',    'fogon',  array[19, 20, 21, 22, 23], 1),
  ('camii',        'fogon',  array[14, 15, 16, 20, 21, 22], 2),
  ('flor.dibuja',  'fogon',  array[10, 11, 12, 15, 16, 17], 1),
  ('abucoco',      'fogon',  array[8, 9, 10, 11, 17, 18], 0.5)
on conflict (username) do nothing;

insert into public.fogon_bot_lines (tag, body) values
  ('vc_chat', 'gg'), ('vc_chat', 'uff qué partida'), ('vc_chat', 'jajaja'), ('vc_chat', 'me re lagueó'),
  ('vc_chat', 'otra y me voy'), ('vc_chat', 'alguien más se suma?'), ('vc_chat', 'nooo casi'),
  ('vc_chat', 'pasen un tema'), ('vc_chat', 'qué buena esta canción'), ('vc_chat', 'jaja posta'),
  ('vc_afk', 'ya vuelvo, voy a buscar algo de comer'), ('vc_afk', 'brb 5 min'), ('vc_afk', 'me llaman, ahora vuelvo'), ('vc_afk', 'voy a cargar el mate y vuelvo 🧉'),
  ('vc_back', 'volví'), ('vc_back', 'ya estoy'), ('vc_back', 'listo, qué me perdí?'),
  ('vc_bye', 'bueno me voy, abrazo'), ('vc_bye', 'me desconecto, nos vemos'), ('vc_bye', 'chau gente, mañana sigo'), ('vc_bye', 'me voy a dormir, buenas noches 🌙');

create or replace function public.fogon_bots_voice_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  gaming uuid := '7c1d1f00-0000-4000-8000-00000000c0a3';
  fogon uuid := '7c1d1f00-0000-4000-8000-00000000c0a2';
  juegos uuid := 'f7119590-184d-5295-a2a5-b9cb8c7d7305';
  vc_text uuid := '465a45e0-5cb0-4ccb-ba92-fd9ccd873bca';
  -- para probar: set_config('fogon.test_hour', '22', true) simula la hora y entra sin azar
  v_hour int := coalesce(nullif(current_setting('fogon.test_hour', true), '')::int, extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::int);
  v_test boolean := coalesce(nullif(current_setting('fogon.test_hour', true), ''), '') <> '';
  b record; v_room uuid; v_here int; v_total int; v_p numeric; v_game text; v_line text;
begin
  -- 1) los que se van (ya cumplieron su rato)
  for b in select v.*, p.username from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id where v.channel_id is not null and v.leave_at <= now() loop
    if random() < 0.35 then
      select body into v_line from public.fogon_bot_lines where tag = 'vc_bye' and (body not like '%dormir%' or v_hour >= 23 or v_hour <= 3) order by random() limit 1;
      perform public.fogon_bot_enqueue(vc_text, b.bot_id, v_line, null, make_interval(secs => 1 + random() * 3));
    end if;
    update public.fogon_profiles set custom_status = coalesce(b.prev_status, custom_status) where id = b.bot_id;
    update public.fogon_bot_voice set channel_id = null, game = null, since = null, leave_at = null, afk_until = null, deafened = false, left_at = now() where bot_id = b.bot_id;
  end loop;

  -- 2) los que están: a veces se van un rato (AFK), vuelven, cambian de juego o comentan algo
  for b in select v.*, p.username from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id where v.channel_id is not null loop
    if b.afk_until is not null and b.afk_until <= now() then
      update public.fogon_bot_voice set afk_until = null, deafened = false where bot_id = b.bot_id;
      update public.fogon_profiles set status = 'online' where id = b.bot_id;
      if random() < 0.5 then
        select body into v_line from public.fogon_bot_lines where tag = 'vc_back' order by random() limit 1;
        perform public.fogon_bot_enqueue(vc_text, b.bot_id, v_line, null, make_interval(secs => 1 + random() * 3));
      end if;
    elsif b.afk_until is null and random() < 0.012 then
      update public.fogon_bot_voice set afk_until = now() + make_interval(mins => 3 + floor(random() * 9)::int), deafened = true where bot_id = b.bot_id;
      update public.fogon_profiles set status = 'idle' where id = b.bot_id;
      if random() < 0.6 then
        select body into v_line from public.fogon_bot_lines where tag = 'vc_afk' order by random() limit 1;
        perform public.fogon_bot_enqueue(vc_text, b.bot_id, v_line, null, make_interval(secs => 1 + random() * 3));
      end if;
    elsif b.afk_until is null and random() < 0.01 then
      select body into v_line from public.fogon_bot_lines where tag = 'vc_chat'
        and (b.channel_id = gaming or body not in ('gg', 'uff qué partida', 'me re lagueó', 'otra y me voy', 'nooo casi'))
        and (b.channel_id = fogon or body not in ('pasen un tema', 'qué buena esta canción'))
        order by random() limit 1;
      perform public.fogon_bot_enqueue(vc_text, b.bot_id, v_line, null, make_interval(secs => 1 + random() * 3));
    elsif b.channel_id = gaming and b.afk_until is null and random() < 0.004 then
      v_game := (array['Valorant', 'LoL', 'Minecraft', 'Among Us', 'FIFA', 'CS2', 'Fortnite', 'Rocket League'])[1 + floor(random() * 8)::int];
      update public.fogon_bot_voice set game = v_game where bot_id = b.bot_id;
      update public.fogon_profiles set custom_status = '🎮 jugando ' || v_game where id = b.bot_id;
    end if;
  end loop;

  -- 3) los que tienen ganas de entrar: más en sus horarios, y más si ya hay gente
  select count(*) into v_total from public.fogon_bot_voice where channel_id is not null;
  for b in
    select p.id, p.username, p.custom_status, h.room, h.hours, h.social from public.fogon_bot_habits h join public.fogon_profiles p on p.username = h.username
    where not exists (select 1 from public.fogon_bot_voice v where v.bot_id = p.id and v.channel_id is not null)
      and not exists (select 1 from public.fogon_bot_voice v where v.bot_id = p.id and v.channel_id is null and v.left_at > now() - interval '20 minutes') -- recién se fue
    order by random()
  loop
    exit when v_total >= 8;
    v_room := case b.room when 'gaming' then gaming else fogon end;
    -- a veces se va al otro canal porque están los amigos ahí
    if random() < 0.15 then v_room := case when v_room = gaming then fogon else gaming end; end if;
    select count(*) into v_here from public.fogon_bot_voice where channel_id = v_room;
    v_p := (case when v_hour = any(b.hours) then 0.018 else 0.0015 end) * (1 + b.social * least(v_here, 4) * 0.5);
    if v_test then v_p := case when v_hour = any(b.hours) then 1 else 0 end; end if;
    if random() < v_p then
      v_game := case when v_room = gaming then coalesce(
        (select game from public.fogon_bot_voice where channel_id = gaming and game is not null order by random() limit 1),
        (array['Valorant', 'LoL', 'Minecraft', 'Among Us', 'FIFA', 'CS2', 'Fortnite', 'Rocket League'])[1 + floor(random() * 8)::int]) end;
      insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, game, prev_status, since, leave_at, afk_until)
      values (b.id, v_room, true, false, v_game, b.custom_status, now(), now() + make_interval(mins => 20 + floor(random() * 130)::int), null)
      on conflict (bot_id) do update set channel_id = excluded.channel_id, muted = true, deafened = false, game = excluded.game,
        prev_status = excluded.prev_status, since = now(), leave_at = excluded.leave_at, afk_until = null;
      update public.fogon_profiles set status = 'online',
        custom_status = case when v_room = gaming then '🎮 jugando ' || v_game else '🔊 en el canal de voz Fogón' end where id = b.id;
      if v_room = gaming and v_here = 0 and random() < 0.6 then
        select replace(body, '{g}', v_game) into v_line from public.fogon_bot_lines where tag = 'vc_entra' order by random() limit 1;
        perform public.fogon_bot_enqueue(juegos, b.id, v_line, null, make_interval(secs => 2 + random() * 5));
      end if;
      v_total := v_total + 1;
    end if;
  end loop;
end $$;
revoke execute on function public.fogon_bots_voice_tick() from public, anon, authenticated;
