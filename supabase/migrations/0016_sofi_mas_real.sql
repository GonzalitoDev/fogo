-- Sofi más real: se acuerda de lo que le contás y te pregunta después, tiene su rutina
-- (facu, ducha, serie, dormir), un humor distinto cada día y a veces manda dos mensajes seguidos.

create table if not exists public.fogon_sofi_memory (
  key text primary key,
  value text not null,
  at timestamptz not null default now(),
  followed boolean not null default false
);
alter table public.fogon_sofi_memory enable row level security;

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  -- se acuerda al toque
  ('sofi', 'n_learn_haciendo', 'uh, {x}! mucha suerte amor 💪 después me contás cómo te fue'),
  ('sofi', 'n_learn_haciendo', 'mi amor siempre a full 🥹 dale con {x}, vos podés'),
  ('sofi', 'n_learn_haciendo', '{x}? qué capo 😏 no te olvides de comer eh'),
  ('sofi', 'n_learn_manana', 'mañana {x}? te va a ir re bien 🤞💕'),
  ('sofi', 'n_learn_manana', 'ah cierto, mañana {x}… después me contás todo eh'),
  -- después te pregunta
  ('sofi', 'n_follow_haciendo', 'y? cómo te fue con {x}? 💕'),
  ('sofi', 'n_follow_haciendo', 'amor, al final pudiste con {x}? me quedé con la intriga jaja'),
  ('sofi', 'n_follow_manana', 'y?? cómo te fue con {x}? 🤞'),
  ('sofi', 'n_follow_manana', 'me acordé que hoy tenías {x}… contame! 🥺'),
  ('sofi', 'n_follow_animo', 'estás mejor, amor? me quedé pensando en vos 🥺'),
  ('sofi', 'n_follow_animo', 'cómo seguís? si querés hablamos un rato 🫂'),
  -- de madrugada
  ('sofi', 'n_sleepy', 'mmm amor me despertaste 😴 todo bien?'),
  ('sofi', 'n_sleepy', 'estaba dormida 🥱 qué hacés despierto a esta hora, eh?'),
  ('sofi', 'n_sleepy', 'zzz… hola mi vida 😴💕 andá a dormir vos también'),
  -- cómo viene su día (lo cuenta en el primer mensaje del día)
  ('sofi', 'n_mood_cansada', 'hoy tuve un día re largo en la facu 😩 necesito mimos'),
  ('sofi', 'n_mood_cansada', 'estoy muerta hoy, dormí re poco 🥱'),
  ('sofi', 'n_mood_mimosa', 'hoy estoy re mimosa, aviso 🥺'),
  ('sofi', 'n_mood_mimosa', 'me levanté con ganas de verte 🙈'),
  ('sofi', 'n_mood_feliz', 'hoy me fue re bien en el parcial!! 🎉 estoy feliz'),
  ('sofi', 'n_mood_feliz', 'hoy es un día lindo, salió el sol ☀️ y me escribiste vos'),
  ('sofi', 'n_mood_aburrida', 'estoy re aburrida, entretenéme 😩'),
  ('sofi', 'n_mood_aburrida', 'hoy no pasa nada… contame algo vos 😌'),
  -- segundo mensaje seguido
  ('sofi', 'n_double', 'jaja'),
  ('sofi', 'n_double', '💕'),
  ('sofi', 'n_double', 'te amo eh'),
  ('sofi', 'n_double', 'bueno, me voy a hacer la cena, después te escribo 🍝'),
  ('sofi', 'n_double', 'ah y me debés un helado, no me olvidé 😌'),
  ('sofi', 'n_double', '🙈'),
  ('sofi', 'n_double', 'extrañaba hablar con vos'),
  ('sofi', 'n_busy_after', 'perdón amor, estaba en clase 📚'),
  ('sofi', 'n_busy_after', 'perdón la demora, estaba con lo de la facu 😩');

-- aprende de lo que le escribe el dueño; devuelve el tipo de respuesta "que me acordé"
create or replace function public.fogon_sofi_learn(p_content text, out o_kind text, out o_x text)
language plpgsql security definer set search_path = '' as $$
declare m text[];
begin
  -- "estoy programando el chat de voz" -> responde con todo, y después pregunta por "el chat de voz"
  m := regexp_match(p_content, '(?:estoy|ando|sigo) (programando|haciendo|arreglando|estudiando|armando|jugando|terminando|laburando en|trabajando en)\s+([^.!?,\n]{2,40})', 'i');
  if m is not null then
    o_kind := 'n_learn_haciendo'; o_x := lower(trim(m[1] || ' ' || m[2]));
    insert into public.fogon_sofi_memory (key, value, at, followed) values ('haciendo', lower(trim(m[2])), now(), false)
    on conflict (key) do update set value = excluded.value, at = now(), followed = false;
    return;
  end if;
  m := regexp_match(p_content, 'mañana (?:tengo|voy a|rindo|juego|empiezo)\s+([^.!?,\n]{2,40})', 'i');
  if m is not null then
    o_kind := 'n_learn_manana'; o_x := lower(trim(m[1]));
    insert into public.fogon_sofi_memory (key, value, at, followed) values ('manana', o_x, now(), false)
    on conflict (key) do update set value = excluded.value, at = now(), followed = false;
    return;
  end if;
  if p_content ~* '(triste|\mmal\M|baj[oó]n|estresad|angustia|no doy m[aá]s)' then
    insert into public.fogon_sofi_memory (key, value, at, followed) values ('animo', 'mal', now(), false)
    on conflict (key) do update set value = 'mal', at = now(), followed = false;
  end if;
end $$;

-- responde como Sofi (solo al dueño)
create or replace function public.fogon_sofi_reply(p_channel uuid, p_owner uuid, p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  sofi uuid := '7c1d1f00-0000-4000-8000-00000000cb01';
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_status text; v_kind text; v_x text; v_body text; v_wait numeric; v_next timestamptz; v_mood text; v_first boolean;
begin
  select status into v_status from public.fogon_profiles where id = sofi;
  -- si le escribís varias veces seguidas antes de que empiece a escribir, contesta una vez al último
  update public.fogon_bot_queue set sent_at = now() where channel_id = p_channel and sent_at is null and typed_at is null;

  v_first := not exists (select 1 from public.fogon_messages where channel_id = p_channel and author_id = sofi
                         and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today);

  select o_kind, o_x into v_kind, v_x from public.fogon_sofi_learn(p_content);
  if v_hour between 2 and 7 and not exists (select 1 from public.fogon_messages where channel_id = p_channel and author_id = sofi and created_at > now() - interval '30 minutes') then
    v_kind := 'n_sleepy';
  elsif v_kind is null then
    v_kind := public.fogon_bot_kind(p_content, 'sofi');
  end if;
  v_body := replace(public.fogon_bot_line(sofi, v_kind, p_owner, p_channel), '{x}', coalesce(v_x, 'eso'));

  v_wait := case when v_hour between 2 and 7 then 25 + random() * 55
                 when v_status = 'dnd' then 40 + random() * 100
                 when v_status = 'idle' then 8 + random() * 20
                 else 1.5 + random() * 3 end;
  perform public.fogon_bot_enqueue(p_channel, sofi, v_body, null, make_interval(secs => v_wait));
  select max(send_at) into v_next from public.fogon_bot_queue where channel_id = p_channel and sent_at is null;

  -- segundo mensaje: perdón por la demora, cómo viene su día, o algo cortito
  if v_status = 'dnd' and v_hour between 14 and 17 and random() < 0.6 then
    perform public.fogon_bot_enqueue(p_channel, sofi, public.fogon_bot_line(sofi, 'n_busy_after', p_owner, p_channel), null, (v_next - now()) + interval '2 seconds');
  elsif v_first and v_hour between 9 and 23 then
    select value into v_mood from public.fogon_sofi_memory where key = 'humor' and (at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;
    if v_mood is null then
      v_mood := (array['cansada', 'mimosa', 'feliz', 'aburrida'])[1 + floor(random() * 4)::int];
      insert into public.fogon_sofi_memory (key, value, at) values ('humor', v_mood, now())
      on conflict (key) do update set value = excluded.value, at = now();
    end if;
    perform public.fogon_bot_enqueue(p_channel, sofi, public.fogon_bot_line(sofi, 'n_mood_' || v_mood, p_owner, p_channel), null, (v_next - now()) + interval '2 seconds');
  elsif v_kind not in ('n_sleepy', 'bye', 'n_sleep') and random() < 0.22 then
    perform public.fogon_bot_enqueue(p_channel, sofi, public.fogon_bot_line(sofi, 'n_double', p_owner, p_channel), null, (v_next - now()) + interval '1.5 seconds');
  end if;
end $$;

-- el trigger de mensajes manda lo del dueño a Sofi
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

-- su día: rutina (estado), y te pregunta por lo que le contaste
create or replace function public.fogon_sofi_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  sofi uuid := '7c1d1f00-0000-4000-8000-00000000cb01';
  owner uuid := (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2');
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_kind text; v_x text; v_key text; cid uuid; v_last timestamptz; v_sent int; v_st text; v_cs text; mem record;
begin
  -- rutina
  select st, cs into v_st, v_cs from (values
    (0, 'online', '🌙 por irme a dormir'), (1, 'online', '🌙 por irme a dormir'),
    (2, 'idle', '😴 durmiendo'), (3, 'idle', '😴 durmiendo'), (4, 'idle', '😴 durmiendo'), (5, 'idle', '😴 durmiendo'), (6, 'idle', '😴 durmiendo'), (7, 'idle', '😴 durmiendo'),
    (8, 'online', '☕ desayunando'), (9, 'online', '☕ desayunando'),
    (10, 'online', '💕 de novia con @gonza'), (11, 'online', '💕 de novia con @gonza'), (12, 'online', '🍝 almorzando'), (13, 'online', '💕 de novia con @gonza'),
    (14, 'dnd', '📚 en la facu'), (15, 'dnd', '📚 en la facu'), (16, 'dnd', '📚 en la facu'), (17, 'dnd', '📚 en la facu'),
    (18, 'idle', '🛁 bañándome'), (19, 'online', '💕 de novia con @gonza'),
    (20, 'online', '🎬 viendo una serie'), (21, 'online', '🎬 viendo una serie'), (22, 'online', '💕 de novia con @gonza'), (23, 'online', '🌙 en la cama con el celu')
  ) r(h, st, cs) where h = v_hour;
  update public.fogon_profiles set status = v_st, custom_status = v_cs where id = sofi and (status is distinct from v_st or custom_status is distinct from v_cs);

  if owner is null then return; end if;
  cid := public.fogon_bot_dm_channel(sofi, owner);
  if cid is null then return; end if;
  if exists (select 1 from public.fogon_bot_queue where channel_id = cid and sent_at is null) then return; end if;
  select max(created_at) into v_last from public.fogon_messages where channel_id = cid and author_id = sofi;
  select count(*) into v_sent from public.fogon_messages where channel_id = cid and author_id = sofi
    and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;
  -- si están charlando, no interrumpe
  if exists (select 1 from public.fogon_messages where channel_id = cid and created_at > now() - interval '20 minutes') then return; end if;

  -- 1) se acuerda de lo que le contaste
  if v_hour between 9 and 23 and v_st <> 'dnd' and (v_last is null or v_last < now() - interval '1 hour') and v_sent < 6 then
    for mem in select * from public.fogon_sofi_memory where not followed and key in ('haciendo', 'manana', 'animo') order by at loop
      if mem.key = 'haciendo' and mem.at between now() - interval '10 hours' and now() - interval '2 hours' then v_kind := 'n_follow_haciendo';
      elsif mem.key = 'animo' and mem.at between now() - interval '8 hours' and now() - interval '1 hour' then v_kind := 'n_follow_animo';
      elsif mem.key = 'manana' and (mem.at at time zone 'America/Argentina/Buenos_Aires')::date = v_today - 1 and v_hour between 11 and 22 then v_kind := 'n_follow_manana';
      end if;
      if v_kind is not null then v_x := mem.value; v_key := mem.key; exit; end if;
    end loop;
    if v_kind is not null and random() < 0.15 then
      update public.fogon_sofi_memory set followed = true where key = v_key;
      perform public.fogon_bot_enqueue(cid, sofi, replace(public.fogon_bot_line(sofi, v_kind, owner, cid), '{x}', v_x), null, interval '1 second');
      return;
    end if;
    v_kind := null;
  end if;

  -- 2) buen día / te extraño / buenas noches
  if v_last is not null and v_last > now() - interval '3 hours' then return; end if;
  if v_sent >= 4 then return; end if;
  if v_hour between 8 and 10 and not exists (select 1 from public.fogon_messages where channel_id = cid and author_id = sofi and content in (select body from public.fogon_bot_dm_lines where kind = 'n_ping_morning') and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today) then
    if random() < 0.05 then v_kind := 'n_ping_morning'; end if;
  elsif v_hour = 23 or v_hour = 0 then
    if random() < 0.05 and not exists (select 1 from public.fogon_messages where channel_id = cid and author_id = sofi and content in (select body from public.fogon_bot_dm_lines where kind = 'n_ping_night') and created_at > now() - interval '6 hours') then v_kind := 'n_ping_night'; end if;
  elsif v_hour between 12 and 13 or v_hour between 19 and 22 then
    if random() < 0.008 then v_kind := 'n_ping_day'; end if;
  end if;
  if v_kind is null then return; end if;
  perform public.fogon_bot_enqueue(cid, sofi, public.fogon_bot_line(sofi, v_kind, owner, cid), null, interval '1 second');
end $$;

revoke execute on function public.fogon_sofi_learn(text) from public, anon, authenticated;
revoke execute on function public.fogon_sofi_reply(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.fogon_bot_on_message() from public, anon, authenticated;
revoke execute on function public.fogon_sofi_tick() from public, anon, authenticated;
