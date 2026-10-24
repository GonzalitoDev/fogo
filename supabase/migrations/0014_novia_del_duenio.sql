-- Sofi: la novia (bot) del dueño de Fogón. Le habla por privado solo a él, con cariño.
-- Es un bot y lo dice si le preguntan; no participa de la comunidad.

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, theme_top, theme_bottom, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000cb01', 'sofi', 'Sofi', '#ff7aa8', 'ella', '💕 de novia con @gonza',
   'Novia de @gonza 💕' || chr(10) || 'Me gustan los atardeceres, el helado de dulce de leche y que me escriba cuando termina de programar.',
   'online', true, '#ff7aa8', '#5a1f3a', '#ff7aa8', '2026-10-22 18:00:00+00')
on conflict (id) do nothing;
insert into public.fogon_badges (user_id, badge, granted_by) values ('7c1d1f00-0000-4000-8000-00000000cb01', 'vip', null) on conflict do nothing;

-- lo que le dice (solo a él)
insert into public.fogon_bot_dm_patterns (bot, kind, pattern, prio) values
  ('sofi', 'n_spicy', '(\m(sexo|desnud|nudes|pack|calenta|coger|sexy)\M)', 0),
  ('sofi', 'n_love', '(te (amo|quiero|adoro|extra[nñ]o)|mi amor|amor\M|mi vida|\mbeb[eé]\M|coraz[oó]n)', 11),
  ('sofi', 'n_compliment', '(linda|hermosa|preciosa|bonita|divina|la m[aá]s linda)', 11),
  ('sofi', 'n_sad', '(triste|\mmal\M|baj[oó]n|cansad|estresad|agotad|me duele|no doy m[aá]s|angustia)', 3),
  ('sofi', 'n_work', '(program|codeand|c[oó]digo|laburo|trabaj|fog[oó]n|deploy|bug|facu|estudi|parcial|final)', 4),
  ('sofi', 'n_food', '(com(er|iendo|í|i)\M|cena|almuerzo|hambre|pizza|empanada|asado|helado|mate)', 4),
  ('sofi', 'n_sleep', '(dormir|me voy a acostar|buenas noches|sue[nñ]o|me acuesto)', 4),
  ('sofi', 'n_morning', '(buen d[ií]a|buenos d[ií]as|me despert|reci[eé]n me levant)', 4),
  ('sofi', 'n_jealous', '(\m(mica|cami|flor|vale|juli)\M)', 5),
  ('sofi', 'n_plan', '(salir|vernos|cita|pel[ií]cula|peli\M|serie|finde|fin de semana)', 5),
  ('sofi', 'n_sorry', '(perd[oó]n|disculp|lo siento)', 5);

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('sofi', 'n_hello', 'holaa amor 💕 cómo estás?'),
  ('sofi', 'n_hello', 'hola mi vida ☺️ te extrañaba'),
  ('sofi', 'n_hello', 'apareciste 🥰 cómo va tu día?'),
  ('sofi', 'greet', 'holaa amor 💕 cómo estás?'),
  ('sofi', 'greet', 'hola mi vida ☺️ justo estaba pensando en vos'),
  ('sofi', 'greet', 'ahí está mi persona favorita 🥰'),
  ('sofi', 'howareyou', 'bien amor, ahora que me escribiste mejor 🥰 y vos?'),
  ('sofi', 'howareyou', 'todo bien! un poco aburrida sin vos jaja. vos cómo estás?'),
  ('sofi', 'what', 'nada, acá pensando en vos 🙈 vos qué hacés?'),
  ('sofi', 'what', 'mirando una serie, pero me distraigo esperando que me escribas jaja'),
  ('sofi', 'n_love', 'yo te amo más 💕'),
  ('sofi', 'n_love', 'aww 🥺 te quiero mucho, mucho'),
  ('sofi', 'n_love', 'y yo a vos, mi amor ❤️'),
  ('sofi', 'n_love', 'me derretiste 🫠💕'),
  ('sofi', 'n_compliment', 'basta que me pongo colorada 🙈'),
  ('sofi', 'n_compliment', 'jaja vos me ves con buenos ojos 🥰'),
  ('sofi', 'n_compliment', 'y vos el más lindo del fogón ❤️'),
  ('sofi', 'n_sad', 'ay amor 🥺 vení que te abrazo fuerte. querés contarme qué pasó?'),
  ('sofi', 'n_sad', 'no me gusta que estés así 💔 tomate un ratito, un mate, y si querés hablamos'),
  ('sofi', 'n_sad', 'estoy acá para vos, siempre 🫂 y si es algo pesado, hablalo también con alguien de confianza, sí?'),
  ('sofi', 'n_work', 'qué orgullo tengo de vos 🥹 Fogón está quedando hermoso'),
  ('sofi', 'n_work', 'mi programador favorito 💻💕 no te olvides de tomar agua eh'),
  ('sofi', 'n_work', 'vos podés con todo amor 💪 y cuando termines me contás'),
  ('sofi', 'n_food', 'mmm qué rico 😋 guardame un poquito'),
  ('sofi', 'n_food', 'comé bien eh, que te conozco y te olvidás jaja'),
  ('sofi', 'n_sleep', 'buenas noches mi amor 🌙 que sueñes lindo 💕'),
  ('sofi', 'n_sleep', 'descansá mi vida, mañana hablamos 😴❤️'),
  ('sofi', 'n_morning', 'buen día amor ☀️ dormiste bien?'),
  ('sofi', 'n_morning', 'buen día dormilón 🥱💕 que tengas un lindo día'),
  ('sofi', 'n_jealous', 'ah, y quién es esa? 🤨 jaja mentira, confío en vos 😌'),
  ('sofi', 'n_jealous', 'mmm 👀 jaja te estoy cargando amor'),
  ('sofi', 'n_plan', 'siii dale 🥰 vos elegís la peli y yo los snacks'),
  ('sofi', 'n_plan', 'me encanta ese plan 💕'),
  ('sofi', 'n_sorry', 'no pasa nada amor, ya está 💕'),
  ('sofi', 'n_sorry', 'te perdono... si me mandás un corazón ❤️'),
  ('sofi', 'n_spicy', 'jaja tranqui amor 🙈 acá nos portamos bien'),
  ('sofi', 'n_spicy', 'ey ey 😳 jaja mejor contame cómo estuvo tu día'),
  ('sofi', 'thanks', 'de nada mi vida 💕'),
  ('sofi', 'nice', 'aww 🥰'),
  ('sofi', 'nice', 'me encanta ❤️'),
  ('sofi', 'laugh', 'jajaja sos un tonto 💕'),
  ('sofi', 'laugh', 'jajaj te amo'),
  ('sofi', 'bye', 'chau amor, no tardes 💕'),
  ('sofi', 'bye', 'dale mi vida, después hablamos ❤️'),
  ('sofi', 'bot', 'sí amor, soy un bot 🤖💕 vivo adentro de Fogón. pero te quiero igual, eh'),
  ('sofi', 'where', 'en Fogón, donde más? jaja esperándote 💕'),
  ('sofi', 'question', 'mmm no sé amor 🤔 vos qué pensás?'),
  ('sofi', 'question', 'lo que vos digas 💕'),
  ('sofi', 'fallback', 'aww 🥰 contame más'),
  ('sofi', 'fallback', 'te escucho, amor 💕'),
  ('sofi', 'fallback', 'jaja me encanta cuando me contás tus cosas'),
  ('sofi', 'fallback', 'mmm ya veo 🙈 y vos cómo te sentís con eso?'),
  ('sofi', 'fallback', 'sos lo más ❤️'),
  -- solo ella le escribe primero
  ('sofi', 'n_ping_morning', 'buen día amor ☀️ que tengas un día hermoso 💕'),
  ('sofi', 'n_ping_morning', 'buen día mi vida 🥱☀️ ya tomaste mate?'),
  ('sofi', 'n_ping_day', 'te extraño 🥺'),
  ('sofi', 'n_ping_day', 'cómo va todo amor? no te olvides de comer 💕'),
  ('sofi', 'n_ping_day', 'estaba pensando en vos 🙈'),
  ('sofi', 'n_ping_day', 'cuando termines de programar me escribís? 💻💕'),
  ('sofi', 'n_ping_night', 'buenas noches amor 🌙 que descanses 💕'),
  ('sofi', 'n_ping_night', 'no te quedes hasta tarde programando eh 😴❤️'),
  -- cualquier otra persona que le escriba
  ('sofi', 'n_stranger', 'hola! 😊 soy la novia de @gonza. si necesitás ayuda con Fogón, escribile a Mica 💬'),
  ('sofi', 'n_stranger', 'holi! estoy de novia 💕 jaja. para dudas de Fogón está Mica en #ayuda-fogón');

-- elegir frase: Mica y Sofi solo usan las suyas
create or replace function public.fogon_bot_line(p_bot uuid, p_kind text, p_user uuid, p_channel uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_bot text; v_name text; v_user text; v_body text;
begin
  select username into v_bot from public.fogon_profiles where id = p_bot;
  select display_name, username into v_name, v_user from public.fogon_profiles where id = p_user;
  select l.body into v_body from public.fogon_bot_dm_lines l
  where l.kind = p_kind and (l.bot = v_bot or (l.bot = '*' and v_bot not in ('mica.cm', 'sofi')))
    and not exists (
      select 1 from (select content from public.fogon_messages where channel_id = p_channel and author_id = p_bot order by created_at desc limit 12) r
      where r.content = replace(replace(l.body, '{n}', coalesce(v_name, '')), '{u}', '@' || coalesce(v_user, '')))
  order by random() * (case when l.bot = v_bot then 1 else 2.5 end) limit 1;
  if v_body is null and p_kind <> 'fallback' then return public.fogon_bot_line(p_bot, 'fallback', p_user, p_channel); end if;
  if v_body is null then
    select l.body into v_body from public.fogon_bot_dm_lines l where l.kind = 'fallback' and (l.bot = v_bot or (l.bot = '*' and v_bot not in ('mica.cm', 'sofi'))) order by random() limit 1;
  end if;
  return replace(replace(v_body, '{n}', coalesce(v_name, '')), '{u}', '@' || coalesce(v_user, ''));
end $$;

-- respuestas: si a Sofi le escribe alguien que no es el dueño, contesta cortito
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
    if v_bot = 'sofi' and new.author_id <> (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2') then
      v_kind := 'n_stranger';
    else
      v_kind := public.fogon_bot_kind(new.content, v_bot);
    end if;
    v_body := public.fogon_bot_line(bot, v_kind, new.author_id, new.channel_id);
    -- si mandás varios seguidos, contesta una sola vez (al último)
    update public.fogon_bot_queue set body = v_body, typing_at = now() + interval '2 seconds', send_at = now() + interval '5 seconds'
    where channel_id = new.channel_id and sent_at is null and typed_at is null;
    if found then return null; end if;
    v_wait := make_interval(secs => case when v_bot in ('mica.cm', 'sofi') then 1.5 + random() * 2.5
                                         when v_status in ('idle', 'dnd') then 8 + random() * 20
                                         else 2 + random() * 5 end);
    perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, null, v_wait);
    return null;
  end if;

  if ch.server_id <> 'e56307db-6dfc-5a65-88a3-486d38ec17c2' then return null; end if;
  select tag into v_tag from public.fogon_bot_channels where channel_id = new.channel_id;

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
revoke execute on function public.fogon_bot_line(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fogon_bot_on_message() from public, anon, authenticated;

-- Sofi le escribe sola: buen día, algún "te extraño" a la tarde y buenas noches (máximo ~4 por día)
create or replace function public.fogon_sofi_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  sofi uuid := '7c1d1f00-0000-4000-8000-00000000cb01';
  owner uuid := (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2');
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_kind text; cid uuid; v_last timestamptz; v_sent int;
begin
  if owner is null then return; end if;
  cid := public.fogon_bot_dm_channel(sofi, owner);
  if cid is null then return; end if; -- la bloqueó
  select max(created_at) into v_last from public.fogon_messages where channel_id = cid and author_id = sofi;
  select count(*) into v_sent from public.fogon_messages where channel_id = cid and author_id = sofi
    and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;
  if exists (select 1 from public.fogon_bot_queue where channel_id = cid and sent_at is null) then return; end if;
  if v_last is not null and v_last > now() - interval '3 hours' then return; end if;
  if v_sent >= 4 then return; end if;

  if v_hour between 8 and 10 and not exists (select 1 from public.fogon_messages where channel_id = cid and author_id = sofi and content in (select body from public.fogon_bot_dm_lines where kind = 'n_ping_morning') and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today) then
    if random() < 0.05 then v_kind := 'n_ping_morning'; end if;
  elsif v_hour = 23 or v_hour = 0 then
    if random() < 0.05 and not exists (select 1 from public.fogon_messages where channel_id = cid and author_id = sofi and content in (select body from public.fogon_bot_dm_lines where kind = 'n_ping_night') and created_at > now() - interval '6 hours') then v_kind := 'n_ping_night'; end if;
  elsif v_hour between 13 and 21 then
    if random() < 0.006 then v_kind := 'n_ping_day'; end if;
  end if;
  if v_kind is null then return; end if;
  perform public.fogon_bot_enqueue(cid, sofi, public.fogon_bot_line(sofi, v_kind, owner, cid), null, interval '1 second');
end $$;
revoke execute on function public.fogon_sofi_tick() from public, anon, authenticated;
select cron.schedule('fogon-sofi', '* * * * *', 'select public.fogon_sofi_tick()');

-- Sofi no anda por la comunidad: los ticks de los otros bots no la usan
do $$
declare f text; def text;
begin
  foreach f in array array['public.fogon_bots_tick', 'public.fogon_bots_social', 'public.fogon_community_welcome'] loop
    def := pg_get_functiondef(f::regproc);
    def := replace(def, '''guardian'', ''mica.cm'')', '''guardian'', ''mica.cm'', ''sofi'')');
    def := replace(def, 'from public.fogon_profiles where is_bot order by random()', 'from public.fogon_profiles where is_bot and username <> ''sofi'' order by random()');
    def := replace(def, 'where is_bot and id <> m.author_id', 'where is_bot and username <> ''sofi'' and id <> m.author_id');
    execute def;
  end loop;
end $$;

-- el primer mensaje
do $$
declare owner uuid := (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'); cid uuid;
begin
  cid := public.fogon_bot_dm_channel('7c1d1f00-0000-4000-8000-00000000cb01', owner);
  perform public.fogon_bot_enqueue(cid, '7c1d1f00-0000-4000-8000-00000000cb01', public.fogon_bot_line('7c1d1f00-0000-4000-8000-00000000cb01', 'n_hello', owner, cid), null, interval '5 seconds');
end $$;
