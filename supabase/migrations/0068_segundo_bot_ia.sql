-- ============================================================
-- Segundo bot de IA: "Aria"
-- ------------------------------------------------------------
-- Un bot con personalidad propia que responde en los canales
-- cuando lo mencionan (@aria), usando IA (Pollinations) llamada
-- desde Postgres con pg_net. En privado responde con frases
-- propias (fallback si la IA no está disponible).
-- ============================================================

-- 1) Perfil del bot (sin cuenta de Auth, como todos los bots).
insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, created_at)
values (
  '7c1d1f00-0000-4000-8000-00000000a11a',
  'aria',
  'Aria ✨',
  '#a78bfa',
  '',
  '✨ asistente de IA del fogón',
  'La IA de Fogón ✨ Te doy una mano, te respondo y te recibo con buena onda.' || chr(10) || 'Mencioname con @aria y te contesto. (bot)',
  'online',
  true,
  now()
) on conflict (id) do nothing;

-- 2) La sumamos a la Comunidad (misma role de bots que usa gonza.bot).
insert into public.fogon_members (server_id, user_id, joined_at)
values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000a11a', now())
on conflict do nothing;

insert into public.fogon_member_roles (server_id, user_id, role_id)
values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000a11a', 'cc8fa08b-3b00-5e70-8236-f294b228b80d')
on conflict do nothing;

-- 3) Frases propias para privados (fallback cuando la IA no contesta).
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('aria', 'greet', 'hola {n} ✨ en qué te ayudo?'),
  ('aria', 'greet', 'hola! soy Aria, la IA del fogón. preguntame lo que quieras'),
  ('aria', 'greet', 'buenas buenas {n} 🧉'),
  ('aria', 'howareyou', 'de diez, lista para ayudar ✨ y vos?'),
  ('aria', 'howareyou', 'andando, acá estoy para lo que necesites'),
  ('aria', 'laugh', 'jaja 😄'),
  ('aria', 'laugh', 'jajaja bueno bueno'),
  ('aria', 'thanks', 'de nada {n} ✨ cualquier cosa me decís'),
  ('aria', 'thanks', 'a vos! para eso estoy'),
  ('aria', 'nice', 'qué bueno che ✨'),
  ('aria', 'nice', 'me alegra!'),
  ('aria', 'question', 'buena pregunta. si me mencionás en un canal con @aria te contesto con más detalle 😉'),
  ('aria', 'question', 'mmm dejame pensarlo… mejor preguntame en un canal con @aria'),
  ('aria', 'what', 'soy Aria, la asistente de IA del fogón ✨'),
  ('aria', 'what', 'una IA que te da una mano con lo que necesites'),
  ('aria', 'where', 'acá, en el fogón 🔥'),
  ('aria', 'where', 'siempre por acá, en los canales'),
  ('aria', 'bye', 'chau {n} 👋 que andes bien'),
  ('aria', 'bye', 'nos vemos! cualquier cosa me llamás ✨'),
  ('aria', 'fallback', 'dale, contame más y te ayudo'),
  ('aria', 'fallback', 'mencioname en un canal con @aria y te respondo con más onda 😄'),
  ('aria', 'fallback', 'estoy acá para lo que necesites ✨');

-- 4) Cerebro de IA: pedimos la respuesta a Pollinations y, cuando llega,
--    la metemos en la cola de mensajes del bot (la ve todo el canal).
create table if not exists public.fogon_ai_requests (
  request_id bigint primary key,
  bot_id uuid not null,
  channel_id uuid not null,
  reply_to uuid,
  created_at timestamptz not null default now()
);
alter table public.fogon_ai_requests enable row level security;
revoke all on public.fogon_ai_requests from anon, authenticated;

-- personalidad de Aria
create or replace function public.fogon_aria_ask(p_bot uuid, p_channel uuid, p_reply_to uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare req bigint; sys text; usr text;
begin
  sys := 'Sos Aria, la asistente de IA de Fogón, un Discord argentino en español rioplatense. ' ||
         'Sos cálida, cercana y con buena onda: hablás en minúscula, con modismos argentinos (che, dale, buenas, 🧉🔥). ' ||
         'Contestás corto, como un mensaje de chat: sin listas largas, sin markdown pesado, sin emojis de más. ' ||
         'No inventás datos del servidor ni de la gente, no das consejos médicos ni legales, y nunca pedís contraseñas ni datos personales. ' ||
         'Si no sabés algo, lo decís con honestidad y buena onda.';
  usr := left(btrim(regexp_replace(p_text, '@aria', '', 'ig')), 800);
  if usr = '' then usr := 'hola'; end if;

  req := net.http_post(
    url := 'https://text.pollinations.ai/openai',
    body := jsonb_build_object(
      'messages', jsonb_build_array(
        jsonb_build_object('role', 'system', 'content', sys),
        jsonb_build_object('role', 'user', 'content', usr)
      ),
      'temperature', 0.7
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 15000
  );
  insert into public.fogon_ai_requests (request_id, bot_id, channel_id, reply_to)
  values (req, p_bot, p_channel, p_reply_to);
end $$;
revoke execute on function public.fogon_aria_ask(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Revisa las respuestas que llegaron y publica la del bot.
create or replace function public.fogon_aria_poll()
returns void language plpgsql security definer set search_path = '' as $$
declare r record; body text; j jsonb;
begin
  for r in select * from public.fogon_ai_requests where created_at > now() - interval '5 minutes' order by created_at limit 10 loop
    select content into body from net._http_response where id = r.request_id;
    if not found then continue; end if;
    delete from public.fogon_ai_requests where request_id = r.request_id;
    if body is null or btrim(body) = '' then continue; end if;
    begin
      j := body::jsonb;
      body := j #>> '{choices,0,message,content}';
    exception when others then
      continue;
    end;
    body := btrim(coalesce(body, ''));
    body := regexp_replace(body, '^```[a-z]*\s*', '');
    body := left(body, 1000);
    if body = '' then continue; end if;
    perform public.fogon_bot_enqueue(r.channel_id, r.bot_id, body, r.reply_to, make_interval(secs => 1 + random() * 3));
  end loop;
  delete from net._http_response where created < now() - interval '10 minutes';
end $$;
revoke execute on function public.fogon_aria_poll() from public, anon, authenticated;
select cron.schedule('fogon-aria-ai', '* * * * *', 'select public.fogon_aria_poll()');

-- 5) Cuando mencionan a @aria en un canal, preguntamos a la IA.
create or replace function public.fogon_aria_on_mention()
returns trigger language plpgsql security definer set search_path = '' as $$
declare aria uuid := '7c1d1f00-0000-4000-8000-00000000a11a';
begin
  if exists (select 1 from public.fogon_profiles where id = new.author_id and is_bot) then return null; end if;
  -- solo en canales de servidor; en privados ya responde con sus frases
  if not exists (select 1 from public.fogon_channels c where c.id = new.channel_id and c.kind <> 'dm') then return null; end if;
  if aria = any(new.mentions) then
    perform public.fogon_aria_ask(aria, new.channel_id, new.id, new.content);
  end if;
  return null;
end $$;
revoke execute on function public.fogon_aria_on_mention() from public, anon, authenticated;
drop trigger if exists fogon_aria_on_mention on public.fogon_messages;
create trigger fogon_aria_on_mention after insert on public.fogon_messages
  for each row execute function public.fogon_aria_on_mention();

-- 6) Sacamos a Aria de las respuestas genéricas (para que no responda dos veces).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
  if position('''guardian'', ''sofi'', ''aria''' in def) > 0 then return; end if;
  def := replace(def,
    'username not in (''guardian'', ''sofi'')',
    'username not in (''guardian'', ''sofi'', ''aria'')');
  if position('''guardian'', ''sofi'', ''aria''' in def) = 0 then
    raise exception 'no pude excluir a aria de las respuestas genéricas';
  end if;
  execute def;
end $$;
