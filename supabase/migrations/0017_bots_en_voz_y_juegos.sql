-- Bots que se conectan a los canales de voz a la noche (con el micrófono apagado: no tienen voz),
-- muestran a qué juegan, y juegan con vos por texto: dados, moneda, piedra-papel-tijera,
-- adivinar el número y trivia. Siguen teniendo la etiqueta BOT.

/* ---------- en qué canal de voz está cada bot ---------- */

create table if not exists public.fogon_bot_voice (
  bot_id uuid primary key references public.fogon_profiles(id) on delete cascade,
  channel_id uuid references public.fogon_channels(id) on delete set null,
  muted boolean not null default true,
  deafened boolean not null default false,
  game text,
  prev_status text,
  since timestamptz,
  leave_at timestamptz
);
alter table public.fogon_bot_voice enable row level security;
create policy fogon_bot_voice_read on public.fogon_bot_voice for select to authenticated using (true);
grant select on public.fogon_bot_voice to authenticated;
alter publication supabase_realtime add table public.fogon_bot_voice;

insert into public.fogon_bot_lines (tag, body) values
  ('vc_entra', 'me meto a Gaming a jugar unas {g}, alguien se suma? 🎮'),
  ('vc_entra', 'quién para unas partidas de {g}? estoy en el canal de voz 🎧'),
  ('vc_entra', 'arranco {g} en Gaming, vengan que falta uno'),
  ('vc_entra', 'bueno, me conecto un rato a jugar {g} 🕹️'),
  ('vc_fogon', 'estoy en el canal de voz Fogón charlando, pasen 🔥'),
  ('vc_fogon', 'me tiré un rato en el canal de voz Fogón, vengan a hacer el aguante 🎶');

/* ---------- juegos por texto ---------- */

create table if not exists public.fogon_bot_games (
  channel_id uuid not null,
  user_id uuid not null,
  game text not null default '',
  answer text,
  tries int not null default 0,
  at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.fogon_bot_games enable row level security;

create table if not exists public.fogon_bot_trivia (id serial primary key, q text not null, a text not null, alt text);
alter table public.fogon_bot_trivia enable row level security;
insert into public.fogon_bot_trivia (q, a, alt) values
  ('¿En qué año ganó Argentina su tercer Mundial?', '2022', null),
  ('¿Cuál es la capital de Australia?', 'canberra', null),
  ('¿Cuántos jugadores tiene un equipo de fútbol 5 en cancha?', '5', 'cinco'),
  ('¿Qué banda grabó "De música ligera"?', 'soda stereo', 'soda'),
  ('¿Cómo se llama el fontanero de Nintendo?', 'mario', null),
  ('¿Qué planeta es el más grande del sistema solar?', 'jupiter', 'júpiter'),
  ('¿En qué juego aparece el Creeper?', 'minecraft', null),
  ('¿Cuántos lados tiene un hexágono?', '6', 'seis'),
  ('¿Qué lenguaje se usa para darle estilo a una página web?', 'css', null),
  ('¿Cuál es el río más ancho del mundo?', 'de la plata', 'rio de la plata'),
  ('¿Quién pintó la Mona Lisa?', 'da vinci', 'leonardo'),
  ('¿Cuántos minutos dura un partido de fútbol sin descuento?', '90', 'noventa'),
  ('¿Qué significa "HTML"? (la H)', 'hypertext', 'hyper'),
  ('¿En qué provincia está el Aconcagua?', 'mendoza', null),
  ('¿Cómo se llama el protagonista de The Legend of Zelda?', 'link', null),
  ('¿Cuál es el animal nacional de Argentina?', 'hornero', null),
  ('¿Qué empresa hace la PlayStation?', 'sony', null),
  ('¿Cuántos bits tiene un byte?', '8', 'ocho'),
  ('¿Qué se festeja en Argentina el 9 de julio?', 'independencia', null),
  ('¿Cómo se llama el personaje amarillo que come fantasmas?', 'pac-man', 'pacman');

-- devuelve lo que contesta el bot si el mensaje es parte de un juego (o null si no tiene nada que ver)
create or replace function public.fogon_bot_game(p_channel uuid, p_user uuid, p_content text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  t text := lower(trim(p_content));
  g public.fogon_bot_games;
  n int; mine int; yours int; pick text; res text; q record; v_name text;
begin
  select display_name into v_name from public.fogon_profiles where id = p_user;
  select * into g from public.fogon_bot_games where channel_id = p_channel and user_id = p_user and game <> '' and at > now() - interval '15 minutes';

  if t in ('!juegos', '!jugar', '!ayuda juegos') then
    return 'a qué jugamos? 🎮' || chr(10) || '• !dados' || chr(10) || '• !moneda' || chr(10) || '• !ppt piedra / papel / tijera' || chr(10) || '• !adivina (pienso un número del 1 al 100)' || chr(10) || '• !trivia';
  end if;

  if t = '!dados' then
    yours := 1 + floor(random() * 6)::int; mine := 1 + floor(random() * 6)::int;
    return '🎲 vos sacaste ' || yours || ', yo ' || mine || '. ' || case when yours > mine then 'ganaste vos, la próxima no zafás 😤' when yours < mine then 'gané yo 😎' else 'empate jaja, otra?' end;
  end if;

  if t = '!moneda' then
    return '🪙 ' || (array['cara!', 'ceca!'])[1 + floor(random() * 2)::int];
  end if;

  if t ~ '^!?ppt' or (t ~ '^(piedra|papel|tijera)s?$' and g.game = 'ppt') then
    pick := substring(t from '(piedra|papel|tijera)');
    if pick is null then
      insert into public.fogon_bot_games (channel_id, user_id, game, at) values (p_channel, p_user, 'ppt', now())
      on conflict (channel_id, user_id) do update set game = 'ppt', at = now(), tries = 0;
      return 'dale! piedra, papel o tijera? ✊✋✌️';
    end if;
    res := (array['piedra', 'papel', 'tijera'])[1 + floor(random() * 3)::int];
    update public.fogon_bot_games set game = '' where channel_id = p_channel and user_id = p_user;
    return case res when 'piedra' then '✊' when 'papel' then '✋' else '✌️' end || ' ' || res || '! ' ||
      case when pick = res then 'empate 😅 otra?'
           when (pick, res) in (('piedra', 'tijera'), ('papel', 'piedra'), ('tijera', 'papel')) then 'nooo me ganaste 😩'
           else 'te gané 😎 revancha?' end;
  end if;

  if t = '!adivina' then
    insert into public.fogon_bot_games (channel_id, user_id, game, answer, tries, at) values (p_channel, p_user, 'adivina', (1 + floor(random() * 100)::int)::text, 0, now())
    on conflict (channel_id, user_id) do update set game = 'adivina', answer = excluded.answer, tries = 0, at = now();
    return 'listo, pensé un número del 1 al 100 🤫 a ver si lo sacás';
  end if;
  if g.game = 'adivina' and t ~ '^\d{1,3}$' then
    n := t::int;
    update public.fogon_bot_games set tries = tries + 1, at = now() where channel_id = p_channel and user_id = p_user returning tries into mine;
    if n = g.answer::int then
      update public.fogon_bot_games set game = '' where channel_id = p_channel and user_id = p_user;
      return 'SIII era el ' || g.answer || '! 🎉 lo sacaste en ' || mine || case when mine = 1 then ' intento, sos brujo 🔮' else ' intentos' end;
    end if;
    if mine >= 8 then
      update public.fogon_bot_games set game = '' where channel_id = p_channel and user_id = p_user;
      return 'se te acabaron los intentos 😅 era el ' || g.answer || '. otra? !adivina';
    end if;
    return case when n < g.answer::int then 'más alto ⬆️' else 'más bajo ⬇️' end || case when abs(n - g.answer::int) <= 5 then ' (estás re cerca 🔥)' else '' end;
  end if;

  if t = '!trivia' then
    select * into q from public.fogon_bot_trivia order by random() limit 1;
    insert into public.fogon_bot_games (channel_id, user_id, game, answer, tries, at) values (p_channel, p_user, 'trivia', q.id::text, 0, now())
    on conflict (channel_id, user_id) do update set game = 'trivia', answer = excluded.answer, tries = 0, at = now();
    return '🧠 ' || q.q;
  end if;
  if g.game = 'trivia' and left(t, 1) <> '!' then
    select * into q from public.fogon_bot_trivia where id = g.answer::int;
    update public.fogon_bot_games set game = '' where channel_id = p_channel and user_id = p_user;
    if position(q.a in t) > 0 or (q.alt is not null and position(q.alt in t) > 0) then
      return (array['correcto!! ✅', 'esaaa ✅ sabés un montón', 'bien ahí ✅'])[1 + floor(random() * 3)::int] || ' otra? !trivia';
    end if;
    return 'nop ❌ era ' || q.a || '. otra? !trivia';
  end if;

  return null;
end $$;
revoke execute on function public.fogon_bot_game(uuid, uuid, text) from public, anon, authenticated;

/* ---------- el trigger de mensajes ahora también juega ---------- */

create or replace function public.fogon_bot_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  ch public.fogon_channels; bot uuid; v_bot text; v_kind text; v_body text; v_status text; v_wait interval; v_tag text;
begin
  if exists (select 1 from public.fogon_profiles where id = new.author_id and is_bot) then return null; end if;
  select * into ch from public.fogon_channels where id = new.channel_id;

  if ch.kind = 'dm' then
    select p.id, p.username, p.status into bot, v_bot, v_status
    from public.fogon_dm_participants d join public.fogon_profiles p on p.id = d.user_id and p.is_bot
    where d.channel_id = new.channel_id limit 1;
    if bot is null then return null; end if;
    if v_bot = 'sofi' then
      if new.author_id = (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2') then
        perform public.fogon_sofi_reply(new.channel_id, new.author_id, new.content);
      end if;
      return null;
    end if;
    v_body := public.fogon_bot_game(new.channel_id, new.author_id, new.content);
    if v_body is not null then
      perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, null, make_interval(secs => 0.8 + random() * 1.5));
      return null;
    end if;
    v_kind := public.fogon_bot_kind(new.content, v_bot);
    v_body := public.fogon_bot_line(bot, v_kind, new.author_id, new.channel_id);
    update public.fogon_bot_queue set body = v_body, typing_at = now() + interval '2 seconds', send_at = now() + interval '5 seconds'
    where channel_id = new.channel_id and sent_at is null and typed_at is null;
    if found then return null; end if;
    v_wait := make_interval(secs => case when v_bot = 'mica.cm' then 1.5 + random() * 2.5
                                         when v_status in ('idle', 'dnd') then 8 + random() * 20
                                         else 2 + random() * 5 end);
    perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, null, v_wait);
    return null;
  end if;

  if ch.server_id <> 'e56307db-6dfc-5a65-88a3-486d38ec17c2' then return null; end if;
  select tag into v_tag from public.fogon_bot_channels where channel_id = new.channel_id;

  -- #juegos: juega el que esté en Gaming, o Tincho
  if v_tag = 'juegos' then
    v_body := public.fogon_bot_game(new.channel_id, new.author_id, new.content);
    if v_body is not null then
      select coalesce(
        (select bot_id from public.fogon_bot_voice where channel_id = '7c1d1f00-0000-4000-8000-00000000c0a3' order by random() limit 1),
        (select id from public.fogon_profiles where username = 'tincho_gamer')) into bot;
      insert into public.fogon_bot_replied (message_id) values (new.id) on conflict do nothing;
      perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, new.id, make_interval(secs => 0.8 + random() * 1.5));
      return null;
    end if;
  end if;

  if mica = any(new.mentions) or v_tag = 'ayuda' then
    bot := mica;
    v_kind := public.fogon_bot_kind(new.content, 'mica.cm');
    if v_kind in ('fallback', 'nice', 'laugh') and v_tag = 'ayuda' and not (mica = any(new.mentions)) then
      v_kind := 'question';
    end if;
    v_body := public.fogon_bot_line(bot, v_kind, new.author_id, new.channel_id);
  else
    select id into bot from public.fogon_profiles where is_bot and id = any(new.mentions) and username not in ('guardian', 'sofi') order by random() limit 1;
    if bot is null then return null; end if;
    select bodies[1 + floor(random() * array_length(bodies, 1))::int] into v_body
    from public.fogon_bot_replies where new.content ~ pattern order by prio limit 1;
    select replace(v_body, '{u}', '@' || username) into v_body from public.fogon_profiles where id = new.author_id;
  end if;
  if v_body is null then return null; end if;
  insert into public.fogon_bot_replied (message_id) values (new.id) on conflict do nothing;
  perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, new.id, make_interval(secs => 3 + random() * 6));
  return null;
end $$;
revoke execute on function public.fogon_bot_on_message() from public, anon, authenticated;

/* ---------- cada minuto: los bots entran y salen de los canales de voz ---------- */

create or replace function public.fogon_bots_voice_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  gaming uuid := '7c1d1f00-0000-4000-8000-00000000c0a3';
  fogon uuid := '7c1d1f00-0000-4000-8000-00000000c0a2';
  juegos uuid := 'f7119590-184d-5295-a2a5-b9cb8c7d7305';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  -- para probar: set_config('fogon.test_hour', '22', true) simula la hora y entra sin azar
  v_hour int := coalesce(nullif(current_setting('fogon.test_hour', true), '')::int, extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::int);
  v_test boolean := coalesce(nullif(current_setting('fogon.test_hour', true), ''), '') <> '';
  want_g int; want_f int; have_g int; have_f int; b record; v_game text; v_line text;
begin
  -- cuánta gente "quiere" haber en cada canal según la hora
  want_g := case when v_hour in (21, 22, 23, 0) then 3 when v_hour in (19, 20, 1) then 2 when v_hour between 2 and 6 then 1 when v_hour between 14 and 18 then 1 else 0 end;
  want_f := case when v_hour in (20, 21, 22, 23) then 2 when v_hour in (13, 18, 19, 0) then 1 else 0 end;

  -- los que ya cumplieron su rato se van
  for b in select v.*, p.username from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id where v.channel_id is not null and v.leave_at <= now() loop
    update public.fogon_profiles set custom_status = coalesce(b.prev_status, custom_status) where id = b.bot_id;
    update public.fogon_bot_voice set channel_id = null, game = null, since = null, leave_at = null where bot_id = b.bot_id;
  end loop;

  select count(*) into have_g from public.fogon_bot_voice where channel_id = gaming;
  select count(*) into have_f from public.fogon_bot_voice where channel_id = fogon;

  -- de a uno, de vez en cuando, para que no entren todos juntos
  if have_g < want_g and (v_test or random() < 0.12) then
    select p.id, p.username, p.custom_status into b from public.fogon_profiles p
    where p.username in ('tincho_gamer', 'santi_futbol', 'juli.memes', 'nacho.dev', 'lucho.mate', 'patooo', 'valeee')
      and (v_hour not between 2 and 6 or p.username = 'patooo')
      and not exists (select 1 from public.fogon_bot_voice v where v.bot_id = p.id and v.channel_id is not null)
    order by (p.username = 'tincho_gamer') desc, random() limit 1;
    if b.id is not null then
      v_game := coalesce((select game from public.fogon_bot_voice where channel_id = gaming and game is not null limit 1),
        (array['Valorant', 'LoL', 'Minecraft', 'Among Us', 'FIFA', 'CS2', 'Fortnite', 'Rocket League'])[1 + floor(random() * 8)::int]);
      insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, game, prev_status, since, leave_at)
      values (b.id, gaming, true, false, v_game, b.custom_status, now(), now() + make_interval(mins => 35 + floor(random() * 110)::int))
      on conflict (bot_id) do update set channel_id = excluded.channel_id, muted = true, deafened = false, game = excluded.game,
        prev_status = excluded.prev_status, since = now(), leave_at = excluded.leave_at;
      update public.fogon_profiles set custom_status = '🎮 jugando ' || v_game, status = 'online' where id = b.id;
      if have_g = 0 and random() < 0.7 then
        select replace(body, '{g}', v_game) into v_line from public.fogon_bot_lines where tag = 'vc_entra' order by random() limit 1;
        perform public.fogon_bot_enqueue(juegos, b.id, v_line, null, make_interval(secs => 2 + random() * 5));
      end if;
    end if;
  end if;

  if have_f < want_f and (v_test or random() < 0.1) then
    select p.id, p.username, p.custom_status into b from public.fogon_profiles p
    where p.username in ('ro.musica', 'camii', 'flor.dibuja', 'abucoco', 'lucho.mate')
      and not exists (select 1 from public.fogon_bot_voice v where v.bot_id = p.id and v.channel_id is not null)
    order by random() limit 1;
    if b.id is not null then
      insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, game, prev_status, since, leave_at)
      values (b.id, fogon, true, false, null, b.custom_status, now(), now() + make_interval(mins => 25 + floor(random() * 80)::int))
      on conflict (bot_id) do update set channel_id = excluded.channel_id, muted = true, deafened = false, game = null,
        prev_status = excluded.prev_status, since = now(), leave_at = excluded.leave_at;
      update public.fogon_profiles set custom_status = '🔊 en el canal de voz Fogón', status = 'online' where id = b.id;
      if have_f = 0 and random() < 0.4 then
        select body into v_line from public.fogon_bot_lines where tag = 'vc_fogon' order by random() limit 1;
        perform public.fogon_bot_enqueue(general, b.id, v_line, null, make_interval(secs => 2 + random() * 5));
      end if;
    end if;
  end if;

  -- si sobra gente (cambió la hora), se va uno
  if have_g > want_g and random() < 0.08 then
    update public.fogon_bot_voice set leave_at = now() where bot_id = (select bot_id from public.fogon_bot_voice where channel_id = gaming order by since limit 1);
  end if;
  if have_f > want_f and random() < 0.08 then
    update public.fogon_bot_voice set leave_at = now() where bot_id = (select bot_id from public.fogon_bot_voice where channel_id = fogon order by since limit 1);
  end if;
end $$;
revoke execute on function public.fogon_bots_voice_tick() from public, anon, authenticated;
select cron.schedule('fogon-bots-voz', '* * * * *', 'select public.fogon_bots_voice_tick()');

-- mientras están en voz no se ponen "ausente" con el tick de siempre
do $$
declare def text := pg_get_functiondef('public.fogon_bots_tick'::regproc);
begin
  def := replace(def, 'where id = (select id from public.fogon_profiles where is_bot and username not in (''guardian'', ''mica.cm'', ''sofi'') order by random() limit 1);',
                      'where id = (select id from public.fogon_profiles where is_bot and username not in (''guardian'', ''mica.cm'', ''sofi'') and not exists (select 1 from public.fogon_bot_voice v where v.bot_id = fogon_profiles.id and v.channel_id is not null) order by random() limit 1);');
  execute def;
end $$;
