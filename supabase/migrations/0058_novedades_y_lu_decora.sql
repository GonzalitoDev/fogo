-- 1) #novedades en la comunidad: la cuenta oficial publica las actualizaciones de Fogón de a una,
--    cada un par de horas (10 a 23 h). El dueño puede sumar una al toque escribiéndole a gonza.bot "novedad: …".
-- 2) Lu (lu.deco): una bot que decora las salas con emojis (💬┃general, 🎮┃Gaming…), les pone temporada
--    a las categorías (🎃 en Halloween, 🎄 en Navidad) y avisa en #general lo que decoró.

-- ---------- 1) novedades ----------
do $$
declare
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  bienvenida uuid := '3b618bd2-8f0b-5bb8-b1ca-2d32d1aa57b5';
  nov uuid := '7c1d1f00-0000-4000-8000-00000000ce10';
begin
  if not exists (select 1 from public.fogon_channels where id = nov) then
    insert into public.fogon_channels (id, server_id, kind, name, topic, position, parent_id)
    values (nov, community, 'text', 'novedades', 'Todo lo nuevo de Fogón, apenas sale 🔥', 2, bienvenida);
    -- de solo lectura para todos (se puede reaccionar)
    insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values (community, nov, null, '{}', array['send_messages', 'create_threads', 'create_polls']);
  end if;
  insert into public.fogon_members (server_id, user_id, joined_at) values (community, '7c1d1f00-0000-4000-8000-00000000f001', now()) on conflict do nothing;
end $$;

create table if not exists public.fogon_updates (
  id serial primary key,
  emoji text not null default '🆕',
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
alter table public.fogon_updates enable row level security;
revoke all on public.fogon_updates from anon, authenticated;

insert into public.fogon_updates (emoji, title, body) values
  ('🧵', 'Hilos', 'Pasá el mouse por un mensaje y tocá el globito para abrir un **hilo**: una charla aparte sin llenar el canal. Los ves debajo del canal y en el botón **Hilos** de arriba.'),
  ('📊', 'Encuestas', 'Tocá 📊 al lado de los emojis para armar una **encuesta**: hasta 10 respuestas, una o varias opciones y los resultados en vivo.'),
  ('😀', 'Emojis propios', 'Cada servidor puede subir sus **emojis** (Ajustes del servidor → Emojis) y usarlos con `:nombre:`. Con **Premium** los usás en todos lados.'),
  ('⏳', 'Aislar miembros', 'Los moderadores pueden **aislar** a alguien un rato (de 60 segundos a 1 semana): puede leer pero no escribir ni hablar.'),
  ('📋', 'Registro de auditoría', 'En Ajustes del servidor → **Registro de auditoría** se ve quién cambió qué: roles, canales, baneos, aislamientos y más.'),
  ('🛡️', 'gonza.bot modera la voz', 'En las salas de voz de la comunidad **gonza.bot** se queda moderando: si alguien insulta, avisa, silencia o aísla. ¡Sean buena gente! 🧉'),
  ('🖥️', 'Compartir pantalla', 'En los canales de voz podés **compartir tu pantalla** en tiempo real con el botón de la pantallita.'),
  ('🔒', 'Llamadas más privadas', 'Ahora el audio y la pantalla de las llamadas pasan por un servidor seguro: **nadie de la llamada puede ver tu IP**.'),
  ('🎭', 'Roles tipo Discord', 'Permisos como en Discord, **@everyone** editable y los roles se **ordenan arrastrándolos**.'),
  ('✨', 'Decoraciones de avatar gratis', 'Ajustes → **Decoraciones**: marcos para tu foto de perfil, gratis para todos.'),
  ('🚀', 'Boosts', 'Con **Fogón Premium** podés boostear servidores: banner, mejor calidad de voz, más emojis y link personalizado.'),
  ('🎨', 'Llegó Lu', 'Les presentamos a **@lu.deco**: se encarga de decorar las salas con emojis y de ponerle onda de temporada al servidor 🎃🎄');

create or replace function public.fogon_updates_tick(p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  oficial uuid := '7c1d1f00-0000-4000-8000-00000000f001';
  nov uuid := '7c1d1f00-0000-4000-8000-00000000ce10';
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  u record;
begin
  if not p_force then
    if v_hour not between 10 and 23 then return; end if;
    if exists (select 1 from public.fogon_updates where posted_at > now() - interval '2 hours') then return; end if;
  end if;
  select * into u from public.fogon_updates where posted_at is null order by id limit 1;
  if u.id is null then return; end if;
  update public.fogon_updates set posted_at = now() where id = u.id;
  insert into public.fogon_messages (channel_id, author_id, content)
  values (nov, oficial, left(u.emoji || ' **' || u.title || '**' || chr(10) || u.body || chr(10) || chr(10) || '— Equipo de Fogón 🔥', 2000));
end $$;
revoke execute on function public.fogon_updates_tick(boolean) from public, anon, authenticated;
select cron.schedule('fogon-novedades', '*/5 * * * *', 'select public.fogon_updates_tick()');

-- el dueño le escribe a gonza.bot por privado "novedad: título | texto" (o solo el texto) y sale ya
create or replace function public.fogon_updates_from_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := 'e7809edc-8559-4df6-8d2b-1fffc7a27719';
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  v_txt text; v_title text; v_body text;
begin
  if new.author_id <> v_owner or new.content !~* '^\s*novedad\s*:' then return null; end if;
  if not exists (select 1 from public.fogon_channels c join public.fogon_dm_participants d on d.channel_id = c.id and d.user_id = v_bot where c.id = new.channel_id and c.kind = 'dm') then return null; end if;
  v_txt := btrim(regexp_replace(new.content, '^\s*novedad\s*:\s*', '', 'i'));
  if length(v_txt) < 3 then return null; end if;
  if position('|' in v_txt) > 0 then
    v_title := btrim(split_part(v_txt, '|', 1)); v_body := btrim(substr(v_txt, position('|' in v_txt) + 1));
  else
    v_title := 'Novedad'; v_body := v_txt;
  end if;
  insert into public.fogon_updates (emoji, title, body) values ('🆕', left(v_title, 80), left(v_body, 1800));
  -- sale antes que las que estaban en la cola
  update public.fogon_updates set posted_at = now()
  where id = (select max(id) from public.fogon_updates);
  insert into public.fogon_messages (channel_id, author_id, content)
  values ('7c1d1f00-0000-4000-8000-00000000ce10', '7c1d1f00-0000-4000-8000-00000000f001',
          left('🆕 **' || left(v_title, 80) || '**' || chr(10) || v_body || chr(10) || chr(10) || '— Equipo de Fogón 🔥', 2000));
  perform public.fogon_bot_enqueue(new.channel_id, v_bot, 'listo señor, ya está en #novedades 📢', null, interval '1 second');
  return null;
end $$;
revoke execute on function public.fogon_updates_from_owner() from public, anon, authenticated;
create or replace trigger fogon_updates_from_owner after insert on public.fogon_messages for each row execute function public.fogon_updates_from_owner();

-- que gonza.bot no conteste además con una frase cualquiera
do $$
declare def text := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
begin
  def := replace(def, '    if v_bot = ''gonza.bot'' and public.fogon_gonza_wants_modlog(new.content)',
                      '    if v_bot = ''gonza.bot'' and new.author_id = ''e7809edc-8559-4df6-8d2b-1fffc7a27719'' and new.content ~* ''^\s*novedad\s*:'' then return null; end if;
    if v_bot = ''gonza.bot'' and public.fogon_gonza_wants_modlog(new.content)');
  if position('novedad' in def) = 0 then raise exception 'no pude ajustar fogon_bot_on_message'; end if;
  execute def;
end $$;

-- ---------- 2) Lu, la decoradora ----------
insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, theme_top, theme_bottom, created_at)
values ('7c1d1f00-0000-4000-8000-00000000de01', 'lu.deco', 'Lu', '#f0b232', 'ella', '🎨 decorando las salas',
        'Decoro las salas del Fogón ✨' || chr(10) || 'Emojis, temporadas y onda. Si ves un canal sin emoji, ya le estoy buscando uno 🎨',
        'online', true, '#f0b232', '#4a3510', '#f0b232', now())
on conflict (id) do nothing;
insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000de01', now()) on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000de01', 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('lu.deco', 'greet', 'holaa {n} ✨'), ('lu.deco', 'greet', 'hola! ¿te gusta cómo quedaron las salas? 🎨'),
  ('lu.deco', 'fallback', 'jaja sii'), ('lu.deco', 'fallback', 'me encanta ✨'), ('lu.deco', 'fallback', 'ahora le busco un emoji a eso 🎨'), ('lu.deco', 'fallback', 'qué lindo 💛'),
  ('lu.deco', 'question', 'mmm creo que sí, le pregunto a gonza'), ('lu.deco', 'question', 'buena pregunta! yo solo decoro jaja 🎨'),
  ('lu.deco', 'thanks', 'de nada! 💛'), ('lu.deco', 'bye', 'chau {n}! ✨'), ('lu.deco', 'howareyou', 're bien, eligiendo emojis 🎨'),
  ('lu.deco', 'laugh', 'jajaja'), ('lu.deco', 'nice', 'sii, quedó hermoso ✨'),
  ('lu.deco', 'bot', 'sí, soy la bot decoradora del Fogón 🎨'), ('lu.deco', 'opener', 'hola {n}! si querés un emoji distinto para algún canal, avisale a gonza 🎨');

-- lo que recuerda Lu de cada sala: el nombre sin decorar y su emoji
create table if not exists public.fogon_deco (
  channel_id uuid primary key references public.fogon_channels (id) on delete cascade,
  base text not null,
  emoji text not null,
  last_name text not null,
  at timestamptz not null default now()
);
alter table public.fogon_deco enable row level security;
revoke all on public.fogon_deco from anon, authenticated;
create table if not exists public.fogon_deco_state (k text primary key, v text);
alter table public.fogon_deco_state enable row level security;
revoke all on public.fogon_deco_state from anon, authenticated;

create or replace function public.fogon_deco_emoji(p_name text, p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when n ~ 'bienvenid|welcome' then '👋' when n ~ 'anuncio' then '📣' when n ~ 'novedad|update|changelog' then '🆕'
    when n ~ 'regla|norma' then '📜' when n ~ 'general|charla' then '💬' when n ~ 'meme' then '😂'
    when n ~ 'm[uú]sica|music|radio' then '🎵' when n ~ 'juego|gaming|game|gamer' then '🎮' when n ~ 'program|code|dev|c[oó]digo' then '💻'
    when n ~ 'ayuda|soporte|help|duda' then '🆘' when n ~ 'registro|log|mod' then '🛡️' when n ~ 'staff|admin' then '🛠️'
    when n ~ 'privad' then '🔒' when n ~ 'fog[oó]n' then '🔥' when n ~ 'arte|dibuj|art' then '🎨' when n ~ 'foto|selfie' then '📸'
    when n ~ 'f[uú]tbol|deporte' then '⚽' when n ~ 'cine|peli|serie' then '🎬' when n ~ 'comida|cocina' then '🍕' when n ~ 'mascota' then '🐶'
    when n ~ 'evento' then '🎉' when n ~ 'sugerencia|idea' then '💡' when n ~ 'noticia' then '📰' when n ~ 'estudi|facu|tarea' then '📚'
    when n = 'vc' or n ~ 'voz|voice' then '🎙️'
    when p_kind = 'voice' then '🔊' when p_kind = 'category' then '📁' else '✨' end
  from (select lower(coalesce(p_name, '')) n) x
$$;

create or replace function public.fogon_deco_season()
returns text language sql stable set search_path = '' as $$
  select case
    when (m = 10 and d >= 24) or (m = 11 and d <= 1) then '🎃'
    when (m = 12) or (m = 1 and d <= 6) then '🎄'
    when m = 2 and d between 7 and 14 then '💘'
    when m = 9 and d between 18 and 24 then '🌷'
    else null end
  from (select extract(month from now() at time zone 'America/Argentina/Buenos_Aires')::int m, extract(day from now() at time zone 'America/Argentina/Buenos_Aires')::int d) x
$$;

-- avisos al dueño: los cambios de nombre que hace Lu no se avisan uno por uno
do $$
declare def text := pg_get_functiondef('public.fogon_community_watch'::regproc);
begin
  def := replace(def, '  elsif tg_table_name = ''fogon_channels'' then
    if r.server_id is distinct from community then return null; end if;',
'  elsif tg_table_name = ''fogon_channels'' then
    if r.server_id is distinct from community then return null; end if;
    if current_setting(''fogon.deco'', true) = ''1'' then return null; end if;');
  if position('fogon.deco' in def) = 0 then raise exception 'no pude ajustar fogon_community_watch'; end if;
  execute def;
end $$;

create or replace function public.fogon_deco_tick(p_max integer default 3)
returns void language plpgsql security definer set search_path = '' as $$
declare
  lu uuid := '7c1d1f00-0000-4000-8000-00000000de01';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  v_season text := public.fogon_deco_season();
  v_prev_season text; c record; d record; v_emoji text; v_want text; v_done text[] := '{}'; n int := 0;
begin
  perform set_config('request.jwt.claim.sub', lu::text, true);
  perform set_config('fogon.deco', '1', true);

  for c in
    select ch.* from public.fogon_channels ch
    where ch.server_id = community and ch.kind in ('text', 'voice', 'category')
      and ch.name !~ '^(ticket|cerrado)-' and ch.id <> '7c1d1f00-0000-4000-8000-00000000d002'
    order by case ch.kind when 'category' then 0 else 1 end, ch.position
  loop
    select * into d from public.fogon_deco where channel_id = c.id;
    if d.channel_id is null then
      -- solo las que no tienen emoji: si alguien ya le puso uno, se respeta
      if c.name !~ '^[[:alnum:]]' then continue; end if;
      v_emoji := public.fogon_deco_emoji(c.name, c.kind);
      insert into public.fogon_deco (channel_id, base, emoji, last_name) values (c.id, c.name, v_emoji, c.name);
      d.base := c.name; d.emoji := v_emoji; d.last_name := c.name;
    elsif c.name <> d.last_name then
      -- la renombró alguien: si le sacó el emoji, se decora el nombre nuevo; si le puso otro, se respeta
      if c.name ~ '^[[:alnum:]]' then
        update public.fogon_deco set base = c.name, emoji = public.fogon_deco_emoji(c.name, c.kind), last_name = c.name, at = now() where channel_id = c.id;
        d.base := c.name; d.emoji := public.fogon_deco_emoji(c.name, c.kind);
      else
        delete from public.fogon_deco where channel_id = c.id;
        continue;
      end if;
    end if;

    v_want := case
      when c.kind = 'category' then coalesce(v_season, d.emoji) || ' ' || d.base
      else d.emoji || '┃' || d.base end;
    v_want := left(v_want, 100);
    if c.name = v_want then continue; end if;
    exit when n >= p_max;
    update public.fogon_channels set name = v_want where id = c.id;
    update public.fogon_deco set last_name = v_want, at = now() where channel_id = c.id;
    n := n + 1;
    if c.kind <> 'category' then v_done := v_done || (case when c.kind = 'voice' then '🔊 ' else '#' end || v_want); end if;
  end loop;

  -- avisa en #general (sin spamear: una vez cada tanto)
  select v into v_prev_season from public.fogon_deco_state where k = 'season';
  if coalesce(v_prev_season, '') <> coalesce(v_season, '') then
    insert into public.fogon_deco_state (k, v) values ('season', coalesce(v_season, '')) on conflict (k) do update set v = excluded.v;
    if v_season = '🎃' then perform public.fogon_bot_enqueue(general, lu, '🎃 ¡Se viene Halloween! Le puse calabazas a las categorías, ¿les gusta? 👻', null, interval '3 seconds');
    elsif v_season = '🎄' then perform public.fogon_bot_enqueue(general, lu, '🎄 ¡Modo navidad activado! Decoré las categorías con arbolitos ✨', null, interval '3 seconds');
    elsif v_season = '💘' then perform public.fogon_bot_enqueue(general, lu, '💘 Semana de San Valentín: le puse corazones al server 💛', null, interval '3 seconds');
    elsif v_season = '🌷' then perform public.fogon_bot_enqueue(general, lu, '🌷 ¡Llegó la primavera! Florcitas en las categorías 🌼', null, interval '3 seconds');
    elsif v_prev_season is not null then perform public.fogon_bot_enqueue(general, lu, 'Guardé la decoración de temporada, volvemos a lo de siempre ✨', null, interval '3 seconds');
    end if;
  end if;
  if array_length(v_done, 1) > 0
     and not exists (select 1 from public.fogon_messages where author_id = lu and channel_id = general and created_at > now() - interval '20 minutes') then
    perform public.fogon_bot_enqueue(general, lu,
      case when array_length(v_done, 1) = 1 then '✨ Le puse onda a ' || v_done[1] || ' 🎨'
           else '✨ Decoré ' || array_to_string(v_done, ', ') || ' 🎨' end, null, interval '2 seconds');
  end if;
end $$;
revoke execute on function public.fogon_deco_tick(integer) from public, anon, authenticated;
select cron.schedule('fogon-lu-decora', '*/3 * * * *', 'select public.fogon_deco_tick()');

-- arranca ya: primera tanda de novedades y de decoración
select public.fogon_updates_tick(true);
