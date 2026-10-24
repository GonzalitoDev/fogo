-- Hilo oficial de Fogón (como el de Discord): una cuenta "Fogón" con la etiqueta OFICIAL que
-- te escribe por privado con la bienvenida, novedades y avisos. Nadie le puede responder;
-- solo el dueño (gonza) puede mandar un aviso oficial a todos.

alter table public.fogon_profiles add column if not exists is_official boolean not null default false;

-- desde la app nadie se marca como oficial
do $$
declare def text := pg_get_functiondef('public.fogon_profiles_guard'::regproc);
begin
  def := replace(def, '      new.is_bot := false;
    else', '      new.is_bot := false;
      new.is_official := false;
    else');
  def := replace(def, '      new.is_bot := old.is_bot;', '      new.is_bot := old.is_bot;
      new.is_official := old.is_official;');
  if position('is_official' in def) = 0 then raise exception 'no pude ajustar fogon_profiles_guard'; end if;
  execute def;
end $$;

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, is_official, banner_color, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000f001', 'fogon', 'Fogón', '#f2803a', '', '',
   'Cuenta oficial de Fogón 🔥 Por acá llegan las novedades y los avisos importantes.' || chr(10) || 'Fogón nunca te va a pedir tu contraseña.',
   'online', true, true, '#f2803a', '2026-01-01 00:00:00+00')
on conflict (id) do nothing;

-- la cuenta oficial no charla, no juega, no reacciona (va en las mismas listas que la radio)
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc like '%''radio.fogon''%' and p.prosrc not like '%''radio.fogon'', ''fogon''%' loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, '''radio.fogon''', '''radio.fogon'', ''fogon''');
    execute def;
  end loop;
end $$;

-- en el hilo oficial no se puede escribir
create or replace function public.fogon_official_readonly()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fogon_dm_participants d join public.fogon_profiles p on p.id = d.user_id and p.is_official
             where d.channel_id = new.channel_id and d.user_id <> new.author_id) then
    raise exception 'Este hilo es solo para avisos oficiales de Fogón.';
  end if;
  return new;
end $$;
revoke execute on function public.fogon_official_readonly() from public, anon, authenticated;
create or replace trigger fogon_official_readonly before insert on public.fogon_messages
  for each row execute function public.fogon_official_readonly();

-- dos mensajes seguidos en la misma transacción quedan en orden
do $$
declare def text := pg_get_functiondef('public.fogon_messages_before'::regproc);
begin
  def := replace(def, '    new.created_at := now();', '    new.created_at := clock_timestamp();');
  if position('clock_timestamp' in def) = 0 then raise exception 'no pude ajustar fogon_messages_before'; end if;
  execute def;
end $$;

-- manda un mensaje oficial a una persona
create or replace function public.fogon_official_send(p_user uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  official uuid := '7c1d1f00-0000-4000-8000-00000000f001';
  cid uuid; v_name text;
begin
  select display_name into v_name from public.fogon_profiles where id = p_user and not is_bot;
  if v_name is null then return; end if;
  select a.channel_id into cid from public.fogon_dm_participants a
  join public.fogon_dm_participants b on b.channel_id = a.channel_id
  where a.user_id = official and b.user_id = p_user limit 1;
  if cid is null then
    insert into public.fogon_channels (kind) values ('dm') returning id into cid;
    insert into public.fogon_dm_participants (channel_id, user_id) values (cid, official), (cid, p_user);
  end if;
  insert into public.fogon_messages (channel_id, author_id, content, created_at)
  values (cid, official, replace(p_body, '{nombre}', v_name), clock_timestamp());
end $$;
revoke execute on function public.fogon_official_send(uuid, text) from public, anon, authenticated;

-- bienvenida oficial a cada cuenta nueva
create or replace function public.fogon_official_welcome()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_bot then return new; end if;
  perform public.fogon_official_send(new.id,
    '¡Hola, {nombre}! 👋 Te damos la bienvenida a **Fogón** 🔥' || chr(10) || chr(10) ||
    'Este es el hilo oficial: acá te vamos a avisar de novedades, cambios importantes y cosas de tu cuenta.' || chr(10) || chr(10) ||
    '🔒 **Fogón nunca te va a pedir tu contraseña ni códigos por mensaje.** Si alguien te los pide, no se los des.' || chr(10) ||
    '🤖 Los bots de la comunidad llevan la etiqueta BOT; los avisos oficiales solo llegan desde esta cuenta, con la etiqueta OFICIAL.' || chr(10) || chr(10) ||
    'Este hilo es solo de avisos: no se puede responder. ¡Que lo disfrutes!');
  return new;
end $$;
revoke execute on function public.fogon_official_welcome() from public, anon, authenticated;
create or replace trigger fogon_official_welcome after insert on public.fogon_profiles
  for each row execute function public.fogon_official_welcome();

-- aviso oficial a todos: solo el dueño de Fogón
create or replace function public.fogon_official_broadcast(p_body text)
returns integer language plpgsql security definer set search_path = '' as $$
declare u record; n integer := 0;
begin
  if auth.uid() is distinct from 'e7809edc-8559-4df6-8d2b-1fffc7a27719'::uuid then
    raise exception 'Solo el equipo de Fogón puede mandar avisos oficiales.';
  end if;
  p_body := btrim(coalesce(p_body, ''));
  if length(p_body) < 1 or length(p_body) > 2000 then raise exception 'El aviso tiene que tener entre 1 y 2000 caracteres.'; end if;
  for u in select id from public.fogon_profiles where not is_bot loop
    perform public.fogon_official_send(u.id, p_body);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.fogon_official_broadcast(text) from public, anon;
grant execute on function public.fogon_official_broadcast(text) to authenticated;

-- los que ya están: bienvenida + novedades
do $$
declare u record;
begin
  for u in select id from public.fogon_profiles where not is_bot
           and not exists (select 1 from public.fogon_dm_participants d where d.user_id = fogon_profiles.id
                           and exists (select 1 from public.fogon_dm_participants o where o.channel_id = d.channel_id and o.user_id = '7c1d1f00-0000-4000-8000-00000000f001')) loop
    perform public.fogon_official_send(u.id,
      '¡Hola, {nombre}! 👋 Estrenamos el **hilo oficial de Fogón** 🔥' || chr(10) || chr(10) ||
      'Acá te vamos a avisar de novedades, cambios importantes y cosas de tu cuenta.' || chr(10) ||
      '🔒 **Fogón nunca te va a pedir tu contraseña ni códigos por mensaje.** Si alguien te los pide, no se los des.' || chr(10) || chr(10) ||
      'Este hilo es solo de avisos: no se puede responder.');
    perform public.fogon_official_send(u.id,
      '📣 **Novedades**' || chr(10) ||
      '• 📻 **Radio Fogón**: música las 24 horas en el canal de voz «📻 Radio 24/7». El género cambia según la hora.' || chr(10) ||
      '• 🎵 **Temazo**: pedí temas con `!play` desde cualquier canal de voz.' || chr(10) ||
      '• 💬 Los bots de la comunidad ahora charlan entre ellos y opinan de la música que suena.');
  end loop;
end $$;
