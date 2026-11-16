-- ============================================================
-- Bots configurables desde la UI (crear, editar, prender/apagar)
-- ------------------------------------------------------------
-- Cualquier bot creado acá responde con IA (Pollinations vía
-- pg_net) cuando lo mencionan en un canal. No hace falta programar:
-- se crea con un nombre, un usuario, un color y una personalidad.
-- ============================================================

-- 1) Config de cada bot creado desde la UI.
create table if not exists public.fogon_bots (
  id uuid primary key references public.fogon_profiles(id) on delete cascade,
  personality text not null default '',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.fogon_bots enable row level security;
revoke all on public.fogon_bots from anon, authenticated;

-- 2) RPCs de administración (solo el dueño de Fogón).
create or replace function public.fogon_list_bots()
returns table (id uuid, username text, display_name text, color text, personality text, enabled boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_is_admin() then raise exception 'Solo el dueño puede administrar los bots'; end if;
  return query
    select p.id, p.username, p.display_name, p.color, b.personality, b.enabled
    from public.fogon_bots b join public.fogon_profiles p on p.id = b.id
    order by b.created_at;
end $$;
grant execute on function public.fogon_list_bots() to authenticated;

create or replace function public.fogon_create_bot(p_name text, p_username text, p_color text, p_personality text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bot uuid; v_username text; v_name text;
begin
  if not public.fogon_is_admin() then raise exception 'Solo el dueño puede crear bots'; end if;
  v_username := lower(btrim(regexp_replace(coalesce(p_username, ''), '[^a-z0-9_.]', '', 'g')));
  if length(v_username) < 2 then v_username := 'bot' || substr(md5(random()::text), 1, 6); end if;
  if exists (select 1 from public.fogon_profiles where username = v_username) then
    raise exception 'Ya existe un bot con ese nombre de usuario';
  end if;
  v_name := btrim(coalesce(nullif(p_name, ''), v_username));
  bot := gen_random_uuid();
  insert into public.fogon_profiles (id, username, display_name, color, custom_status, bio, status, is_bot, created_at)
  values (bot, v_username, v_name, coalesce(nullif(btrim(p_color), ''), '#a78bfa'), '✨ bot de la comunidad', 'Bot creado desde Fogón ✨', 'online', true, now());
  insert into public.fogon_bots (id, personality, created_by) values (bot, coalesce(p_personality, ''), auth.uid());
  insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', bot, now()) on conflict do nothing;
  insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', bot, 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;
  return bot;
end $$;
grant execute on function public.fogon_create_bot(text, text, text, text) to authenticated;

create or replace function public.fogon_update_bot(p_id uuid, p_name text, p_personality text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_is_admin() then raise exception 'Solo el dueño puede editar los bots'; end if;
  if nullif(btrim(p_name), '') is not null then
    update public.fogon_profiles set display_name = btrim(p_name) where id = p_id and is_bot;
  end if;
  update public.fogon_bots set
    personality = coalesce(p_personality, personality),
    enabled = coalesce(p_enabled, enabled)
  where id = p_id;
end $$;
grant execute on function public.fogon_update_bot(uuid, text, text, boolean) to authenticated;

create or replace function public.fogon_delete_bot(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_is_admin() then raise exception 'Solo el dueño puede borrar los bots'; end if;
  delete from public.fogon_bots where id = p_id;
  delete from public.fogon_members where user_id = p_id;
  delete from public.fogon_member_roles where user_id = p_id;
  delete from public.fogon_profiles where id = p_id and is_bot;
end $$;
grant execute on function public.fogon_delete_bot(uuid) to authenticated;

-- 3) Cerebro genérico de IA: cualquier bot configurado responde.
create table if not exists public.fogon_ai_requests (
  request_id bigint primary key,
  bot_id uuid not null,
  channel_id uuid not null,
  reply_to uuid,
  created_at timestamptz not null default now()
);
alter table public.fogon_ai_requests enable row level security;
revoke all on public.fogon_ai_requests from anon, authenticated;

create or replace function public.fogon_bot_ai_ask(p_bot uuid, p_personality text, p_channel uuid, p_reply_to uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare req bigint; sys text; usr text;
begin
  sys := btrim(coalesce(p_personality, ''));
  if sys = '' then
    sys := 'Sos un bot de Fogón, un Discord argentino en español rioplatense. Contestás corto y con buena onda.';
  end if;
  usr := left(btrim(regexp_replace(p_text, '@[a-z0-9_.]+', '', 'ig')), 800);
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
revoke execute on function public.fogon_bot_ai_ask(uuid, text, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.fogon_bot_ai_poll()
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
revoke execute on function public.fogon_bot_ai_poll() from public, anon, authenticated;
select cron.schedule('fogon-bots-ai', '* * * * *', 'select public.fogon_bot_ai_poll()');

-- 4) Trigger genérico: cualquier bot configurado y encendido responde al mencionarlo.
create or replace function public.fogon_bot_ai_on_mention()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  if exists (select 1 from public.fogon_profiles where id = new.author_id and is_bot) then return null; end if;
  if not exists (select 1 from public.fogon_channels c where c.id = new.channel_id and c.kind <> 'dm') then return null; end if;
  for b in
    select p.id, bot.personality
    from public.fogon_profiles p join public.fogon_bots bot on bot.id = p.id
    where bot.enabled and p.id = any(new.mentions)
  loop
    perform public.fogon_bot_ai_ask(b.id, b.personality, new.channel_id, new.id, new.content);
  end loop;
  return null;
end $$;
revoke execute on function public.fogon_bot_ai_on_mention() from public, anon, authenticated;
drop trigger if exists fogon_bot_ai_on_mention on public.fogon_messages;
create trigger fogon_bot_ai_on_mention after insert on public.fogon_messages
  for each row execute function public.fogon_bot_ai_on_mention();

-- 5) Sacamos a los bots configurables de las respuestas genéricas (para que no respondan dos veces).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
  -- por si quedó una versión anterior que ya excluía a aria, la normalizamos primero
  def := replace(def, 'username not in (''guardian'', ''sofi'', ''aria'')', 'username not in (''guardian'', ''sofi'')');
  if position('not exists (select 1 from public.fogon_bots b' in def) = 0 then
    def := replace(def,
      'username not in (''guardian'', ''sofi'')',
      'username not in (''guardian'', ''sofi'') and not exists (select 1 from public.fogon_bots b where b.id = fogon_profiles.id)');
  end if;
  if position('not exists (select 1 from public.fogon_bots b' in def) = 0 then
    raise exception 'no pude excluir a los bots configurables de las respuestas genéricas';
  end if;
  execute def;
end $$;

-- 6) Aria como bot de ejemplo (arranca prendida y la podés editar desde la UI).
do $$
declare aria uuid := '7c1d1f00-0000-4000-8000-00000000a11a';
begin
  if not exists (select 1 from public.fogon_profiles where id = aria) then
    insert into public.fogon_profiles (id, username, display_name, color, custom_status, bio, status, is_bot, created_at)
    values (aria, 'aria', 'Aria ✨', '#a78bfa', '✨ asistente de IA del fogón', 'La IA de Fogón ✨ Mencioname con @aria y te contesto.', 'online', true, now());
  end if;
  if not exists (select 1 from public.fogon_bots where id = aria) then
    insert into public.fogon_bots (id, personality)
    values (aria, 'Sos Aria, la asistente de IA de Fogón, un Discord argentino en español rioplatense. Sos cálida, cercana y con buena onda: hablás en minúscula, con modismos argentinos (che, dale, buenas, 🧉🔥). Contestás corto, como un mensaje de chat, sin listas largas. No inventás datos del servidor ni de la gente, y nunca pedís contraseñas.');
    insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', aria, now()) on conflict do nothing;
    insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', aria, 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;
  end if;
end $$;
