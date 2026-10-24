-- Servidor privado: solo el dueño de Fogón y Mica. Nadie más puede entrar.
-- En #novedades Mica avisa (con mención, así llega la notificación) todo lo que cambia en la
-- Comunidad de Fogón; a las 21 h deja un resumen del día; y en #charla te contesta.

insert into public.fogon_servers (id, name, owner_id, invite_code, created_at)
select '7c1d1f00-0000-4000-8000-00000000ce01', 'Privado 🔒', s.owner_id, substr(md5(random()::text || clock_timestamp()::text), 1, 16), now()
from public.fogon_servers s where s.id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
on conflict (id) do nothing;

insert into public.fogon_members (server_id, user_id)
select '7c1d1f00-0000-4000-8000-00000000ce01', owner_id from public.fogon_servers where id = '7c1d1f00-0000-4000-8000-00000000ce01'
on conflict do nothing;
insert into public.fogon_members (server_id, user_id) values ('7c1d1f00-0000-4000-8000-00000000ce01', '7c1d1f00-0000-4000-8000-00000000ca01') on conflict do nothing;

insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values
  ('7c1d1f00-0000-4000-8000-00000000ce02', '7c1d1f00-0000-4000-8000-00000000ce01', 'category', 'MICA Y YO', '', null, 0),
  ('7c1d1f00-0000-4000-8000-00000000ce03', '7c1d1f00-0000-4000-8000-00000000ce01', 'text', 'novedades', 'Todo lo que pasa en la Comunidad de Fogón, al momento', '7c1d1f00-0000-4000-8000-00000000ce02', 0),
  ('7c1d1f00-0000-4000-8000-00000000ce04', '7c1d1f00-0000-4000-8000-00000000ce01', 'text', 'resumen-diario', 'Mica deja el resumen del día a las 21 h', '7c1d1f00-0000-4000-8000-00000000ce02', 1),
  ('7c1d1f00-0000-4000-8000-00000000ce05', '7c1d1f00-0000-4000-8000-00000000ce01', 'text', 'charla', 'Hablá con Mica. Probá «resumen» o «estado»', '7c1d1f00-0000-4000-8000-00000000ce02', 2),
  ('7c1d1f00-0000-4000-8000-00000000ce06', '7c1d1f00-0000-4000-8000-00000000ce01', 'voice', 'Oficina', '', '7c1d1f00-0000-4000-8000-00000000ce02', 3)
on conflict (id) do nothing;

-- nadie más entra, aunque consiga el link
do $$
declare def text := pg_get_functiondef('public.fogon_join_server'::regproc);
begin
  def := replace(def, '  if sid is null then raise exception ''La invitación no es válida o ya no existe''; end if;',
    '  if sid is null then raise exception ''La invitación no es válida o ya no existe''; end if;
  if sid = ''7c1d1f00-0000-4000-8000-00000000ce01'' and auth.uid() is distinct from (select owner_id from public.fogon_servers where id = sid) then
    raise exception ''Este servidor es privado'' using errcode = ''42501'';
  end if;');
  if position('Este servidor es privado' in def) = 0 then raise exception 'no pude cerrar el servidor privado'; end if;
  execute def;
end $$;

/* ---------- avisos de Mica ---------- */

create or replace function public.fogon_owner_notify(p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner text;
begin
  select p.username into v_owner from public.fogon_servers s join public.fogon_profiles p on p.id = s.owner_id where s.id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  perform public.fogon_bot_enqueue('7c1d1f00-0000-4000-8000-00000000ce03', '7c1d1f00-0000-4000-8000-00000000ca01',
    p_text || ' @' || v_owner, null, interval '1 second');
end $$;
revoke execute on function public.fogon_owner_notify(text) from public, anon, authenticated;

create or replace function public.fogon_community_watch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  r record; o record; v_user text; v_n int; v_txt text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_op = 'UPDATE' then o := old; end if;

  if tg_table_name = 'fogon_members' then
    if r.server_id <> community or exists (select 1 from public.fogon_profiles where id = r.user_id and is_bot) then return null; end if;
    select username into v_user from public.fogon_profiles where id = r.user_id;
    select count(*) into v_n from public.fogon_members m join public.fogon_profiles p on p.id = m.user_id and not p.is_bot where m.server_id = community;
    v_txt := case when tg_op = 'INSERT' then '👋 Se unió **@' || coalesce(v_user, '?') || '** a la comunidad. Ya son ' || v_n || ' personas.'
                  else '🚪 **@' || coalesce(v_user, '?') || '** salió de la comunidad (o lo echaron). Quedan ' || v_n || ' personas.' end;

  elsif tg_table_name = 'fogon_bans' then
    if r.server_id <> community then return null; end if;
    select username into v_user from public.fogon_profiles where id = r.user_id;
    v_txt := '🔨 Banearon a **@' || coalesce(v_user, '?') || '**' || coalesce(' — motivo: ' || nullif(r.reason, ''), '') || '.';

  elsif tg_table_name = 'fogon_channels' then
    if r.server_id is distinct from community then return null; end if;
    if r.name ~ '^(ticket|cerrado)-\d' then return null; end if; -- los tickets se avisan aparte
    if tg_op = 'INSERT' then v_txt := '➕ Nuevo ' || case r.kind when 'category' then 'categoría **' || r.name || '**' when 'voice' then 'canal de voz **' || r.name || '**' else 'canal **#' || r.name || '**' end || '.';
    elsif tg_op = 'DELETE' then v_txt := '🗑️ Se borró ' || case r.kind when 'category' then 'la categoría **' || r.name || '**' else 'el canal **' || r.name || '**' end || '.';
    elsif o.name is distinct from r.name then v_txt := '✏️ Renombraron **' || o.name || '** → **' || r.name || '**.';
    else return null; end if;

  elsif tg_table_name = 'fogon_roles' then
    if r.server_id <> community then return null; end if;
    if tg_op = 'INSERT' then v_txt := '🎭 Nuevo rol **' || r.name || '**.';
    elsif tg_op = 'DELETE' then v_txt := '🎭 Se borró el rol **' || r.name || '**.';
    elsif o.name is distinct from r.name then v_txt := '🎭 Renombraron el rol **' || o.name || '** → **' || r.name || '**.';
    elsif o.perms is distinct from r.perms then v_txt := '🎭 Cambiaron los permisos del rol **' || r.name || '**.';
    else return null; end if;

  elsif tg_table_name = 'fogon_timeouts' then
    if r.server_id <> community then return null; end if;
    select username into v_user from public.fogon_profiles where id = r.user_id;
    v_txt := '⏳ El Guardián silenció a **@' || coalesce(v_user, '?') || '** hasta las ' || to_char(r.until at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') || ' (' || coalesce(r.reason, 'moderación') || ').';

  elsif tg_table_name = 'fogon_tickets' then
    select username into v_user from public.fogon_profiles where id = r.user_id;
    if tg_op = 'INSERT' then v_txt := '📬 **@' || coalesce(v_user, '?') || '** abrió el ticket **#' || lpad(r.id::text, 4, '0') || '**. Mica ya lo está atendiendo.';
    elsif o.status = 'open' and r.status = 'closed' then v_txt := '🔒 Se cerró el ticket **#' || lpad(r.id::text, 4, '0') || '** de @' || coalesce(v_user, '?') || '.';
    elsif o.topic is distinct from r.topic and r.topic = 't_urgente' then v_txt := '⚠️ **URGENTE:** el ticket **#' || lpad(r.id::text, 4, '0') || '** de @' || coalesce(v_user, '?') || ' parece una situación de riesgo. Mirá STAFF ya.';
    else return null; end if;

  elsif tg_table_name = 'fogon_badges' then
    if tg_op <> 'INSERT' then return null; end if;
    select username into v_user from public.fogon_profiles where id = r.user_id and not is_bot;
    if v_user is null then return null; end if;
    v_txt := '🏅 **@' || v_user || '** ganó la insignia **' || r.badge || '**.';

  elsif tg_table_name = 'fogon_servers' then
    if r.id <> community or tg_op <> 'UPDATE' then return null; end if;
    if o.name is distinct from r.name then v_txt := '🏷️ La comunidad ahora se llama **' || r.name || '**.';
    elsif o.invite_code is distinct from r.invite_code then v_txt := '🔗 Se generó un link de invitación nuevo para la comunidad.';
    else return null; end if;
  end if;

  if v_txt is not null then perform public.fogon_owner_notify(v_txt); end if;
  return null;
end $$;
revoke execute on function public.fogon_community_watch() from public, anon, authenticated;

create or replace trigger fogon_watch_members after insert or delete on public.fogon_members for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_bans after insert on public.fogon_bans for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_channels after insert or update or delete on public.fogon_channels for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_roles after insert or update or delete on public.fogon_roles for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_timeouts after insert or update on public.fogon_timeouts for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_tickets after insert or update on public.fogon_tickets for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_badges after insert on public.fogon_badges for each row execute function public.fogon_community_watch();
create or replace trigger fogon_watch_servers after update on public.fogon_servers for each row execute function public.fogon_community_watch();

/* ---------- resumen ---------- */

create or replace function public.fogon_community_stats()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  v_people int; v_new int; v_msgs int; v_human int; v_open int; v_blocked int; v_silenced int; v_top text; v_voice int;
begin
  select count(*) into v_people from public.fogon_members m join public.fogon_profiles p on p.id = m.user_id and not p.is_bot where m.server_id = community;
  select count(*) into v_new from public.fogon_members m join public.fogon_profiles p on p.id = m.user_id and not p.is_bot where m.server_id = community and m.joined_at > now() - interval '24 hours';
  select count(*), count(*) filter (where not p.is_bot) into v_msgs, v_human from public.fogon_messages x
    join public.fogon_channels c on c.id = x.channel_id and c.server_id = community join public.fogon_profiles p on p.id = x.author_id
    where x.created_at > now() - interval '24 hours';
  select count(*) into v_open from public.fogon_tickets where status = 'open';
  select count(*) into v_blocked from public.fogon_automod_log where server_id = community and at > now() - interval '24 hours';
  select count(*) into v_silenced from public.fogon_timeouts where server_id = community and until > now() - interval '24 hours';
  select count(*) into v_voice from public.fogon_bot_voice where channel_id is not null;
  select '@' || p.username || ' (' || count(*) || ')' into v_top from public.fogon_messages x
    join public.fogon_channels c on c.id = x.channel_id and c.server_id = community join public.fogon_profiles p on p.id = x.author_id and not p.is_bot
    where x.created_at > now() - interval '24 hours' group by p.username order by count(*) desc limit 1;
  return '📊 **Comunidad de Fogón — últimas 24 h**' || chr(10) ||
    '• Personas: **' || v_people || '** (' || v_new || ' nuevas)' || chr(10) ||
    '• Mensajes: **' || v_msgs || '** (' || v_human || ' de personas, el resto de los bots)' || chr(10) ||
    '• Quien más escribió: ' || coalesce(v_top, 'nadie todavía') || chr(10) ||
    '• Tickets abiertos: **' || v_open || '**' || chr(10) ||
    '• Guardián: ' || v_blocked || ' mensajes tapados, ' || v_silenced || ' silenciados' || chr(10) ||
    '• Bots en canales de voz ahora: ' || v_voice;
end $$;
revoke execute on function public.fogon_community_stats() from public, anon, authenticated;

create or replace function public.fogon_daily_summary()
returns void language plpgsql security definer set search_path = '' as $$
declare v_day text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD');
begin
  if extract(hour from now() at time zone 'America/Argentina/Buenos_Aires') <> 21 then return; end if;
  if exists (select 1 from public.fogon_mica_done where key = 'resumen:' || v_day) then return; end if;
  insert into public.fogon_mica_done (key) values ('resumen:' || v_day) on conflict do nothing;
  perform public.fogon_bot_enqueue('7c1d1f00-0000-4000-8000-00000000ce04', '7c1d1f00-0000-4000-8000-00000000ca01',
    'Buenas noches 🌙 acá va el resumen de hoy:' || chr(10) || chr(10) || public.fogon_community_stats(), null, interval '2 seconds');
end $$;
revoke execute on function public.fogon_daily_summary() from public, anon, authenticated;
select cron.schedule('fogon-resumen-diario', '* * * * *', 'select public.fogon_daily_summary()');

/* ---------- #charla: Mica te contesta ---------- */

do $$
declare def text := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
begin
  def := replace(def, '  if ch.server_id <> ''e56307db-6dfc-5a65-88a3-486d38ec17c2'' then return null; end if;',
'  if ch.id = ''7c1d1f00-0000-4000-8000-00000000ce05'' then
    if new.content ~* ''(resumen|estado|stats|c[oó]mo va|c[oó]mo viene|novedades|n[uú]meros)'' then
      v_body := public.fogon_community_stats();
    else
      v_body := public.fogon_bot_line(mica, public.fogon_bot_kind(new.content, ''mica.cm''), new.author_id, new.channel_id);
    end if;
    perform public.fogon_bot_enqueue(new.channel_id, mica, v_body, new.id, make_interval(secs => 1.5 + random() * 2));
    return null;
  end if;
  if ch.server_id <> ''e56307db-6dfc-5a65-88a3-486d38ec17c2'' then return null; end if;');
  if position('7c1d1f00-0000-4000-8000-00000000ce05' in def) = 0 then raise exception 'no pude enganchar #charla'; end if;
  execute def;
end $$;

-- el primer mensaje
insert into public.fogon_messages (channel_id, author_id, content) values
  ('7c1d1f00-0000-4000-8000-00000000ce03', '7c1d1f00-0000-4000-8000-00000000ca01',
   '¡Hola jefe! 👋 Este es nuestro servidor privado: solo estamos vos y yo.' || chr(10) || chr(10) ||
   '• Acá en **#novedades** te aviso al toque todo lo que cambie en la comunidad: gente que entra o sale, baneos, canales y roles nuevos, tickets, silencios del Guardián e insignias.' || chr(10) ||
   '• En **#resumen-diario** te dejo los números del día a las 21 h.' || chr(10) ||
   '• En **#charla** hablame cuando quieras; escribí «resumen» y te paso cómo viene todo.');
