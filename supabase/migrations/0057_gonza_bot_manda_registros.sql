-- "gonza.bot, dame los registros de moderación": le manda al dueño un privado con los registros.
-- Funciona por escrito (mencionándolo o por privado) y por voz (con "los bots me escuchan" prendido).

create or replace function public.fogon_gonza_modlog_send(p_user uuid, p_days integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  cid uuid; since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 30)));
  v_period text := case when p_days >= 7 then 'última semana' else 'últimas 24 horas' end;
  m1 text; m2 text; n int; r record; v_iso text;
begin
  cid := public.fogon_bot_dm_channel(v_bot, p_user);
  if cid is null then return; end if;

  select count(*) into n from public.fogon_automod_log where server_id = community and at > since;
  m1 := '🛡️ **Registros de moderación** — ' || v_period || chr(10);
  if n = 0 then
    m1 := m1 || 'Nada, todo tranqui 🧉';
  else
    m1 := m1 || '**' || n || '** ' || case when n = 1 then 'aviso' else 'avisos' end || ': '
      || (select string_agg(reason || ' ×' || c, ', ' order by c desc) from (select reason, count(*) c from public.fogon_automod_log where server_id = community and at > since group by reason) x) || chr(10);
    for r in
      select l.at, p.username, l.reason, coalesce(c.name, '?') ch, c.kind, l.content
      from public.fogon_automod_log l left join public.fogon_profiles p on p.id = l.user_id left join public.fogon_channels c on c.id = l.channel_id
      where l.server_id = community and l.at > since order by l.at desc limit 10
    loop
      m1 := m1 || '• `' || to_char(r.at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || '` @' || coalesce(r.username, '?') || ' — ' || r.reason
        || ' (' || case when r.kind = 'voice' then '🔊 ' else '#' end || r.ch || ')'
        || case when coalesce(r.content, '') <> '' then ' «' || replace(left(r.content, 60), chr(10), ' ') || case when length(r.content) > 60 then '…' else '' end || '»' else '' end || chr(10);
    end loop;
    if n > 10 then m1 := m1 || '…y ' || (n - 10) || ' más en #registro-mod'; end if;
  end if;
  select string_agg('@' || p.username || ' hasta las ' || to_char(t.until at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), ', ') into v_iso
  from public.fogon_timeouts t join public.fogon_profiles p on p.id = t.user_id where t.server_id = community and t.until > now();
  if v_iso is not null then m1 := m1 || chr(10) || '⏳ Aislados ahora: ' || v_iso; end if;

  m2 := '📋 **Auditoría** — lo último que hizo el equipo' || chr(10);
  n := 0;
  for r in
    select a.at, coalesce(p.username, 'Fogón') who, a.action, a.target_name, a.details
    from public.fogon_audit a left join public.fogon_profiles p on p.id = a.actor_id
    where a.server_id = community and a.at > since
      and (a.action like 'member_%' or a.action like 'message_delete' or a.action like 'role_%' or a.action like 'channel_%')
    order by a.at desc limit 10
  loop
    n := n + 1;
    m2 := m2 || '• `' || to_char(r.at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || '` @' || r.who || ' '
      || case r.action
           when 'member_ban' then 'baneó a' when 'member_unban' then 'desbaneó a' when 'member_kick' then 'echó a'
           when 'member_timeout' then 'aisló a' when 'member_timeout_remove' then 'le quitó el aislamiento a'
           when 'member_voice_mod' then 'cambió la voz de' when 'member_role_add' then 'le dio un rol a' when 'member_role_remove' then 'le sacó un rol a'
           when 'message_delete' then 'borró un mensaje de' when 'role_insert' then 'creó el rol' when 'role_update' then 'cambió el rol' when 'role_delete' then 'borró el rol'
           when 'channel_insert' then 'creó el canal' when 'channel_update' then 'cambió el canal' when 'channel_delete' then 'borró el canal'
           when 'channel_perms_update' then 'cambió permisos de' else r.action end
      || ' ' || coalesce(r.target_name, '')
      || case when r.details ? 'motivo' and r.details ->> 'motivo' is not null then ' («' || left(r.details ->> 'motivo', 50) || '»)' else '' end || chr(10);
  end loop;
  if n = 0 then m2 := m2 || 'Sin cambios del equipo en este tiempo.'; end if;

  perform public.fogon_bot_enqueue(cid, v_bot, left(m1, 2000), null, interval '1 second');
  perform public.fogon_bot_enqueue(cid, v_bot, left(m2, 2000), null, interval '3 seconds');
end $$;
revoke execute on function public.fogon_gonza_modlog_send(uuid, integer) from public, anon, authenticated;

create or replace function public.fogon_gonza_wants_modlog(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') ~* '(registros?|logs?|historial|reporte|informe)\s+(de\s+)?(la\s+)?(moderaci[oó]n|mod\M|moderar|sanciones|baneos)'
$$;

-- por escrito: el dueño se lo pide por privado o mencionándolo en un canal
create or replace function public.fogon_gonza_modlog_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  v_owner uuid := 'e7809edc-8559-4df6-8d2b-1fffc7a27719';
  ch record;
begin
  if new.author_id <> v_owner or not public.fogon_gonza_wants_modlog(new.content) then return null; end if;
  select id, kind into ch from public.fogon_channels where id = new.channel_id;
  if ch.kind = 'dm' then
    if not exists (select 1 from public.fogon_dm_participants where channel_id = ch.id and user_id = v_bot) then return null; end if;
  elsif not (v_bot = any(coalesce(new.mentions, '{}')) or new.content ~* 'gonza\.?bot|@gonza\.bot') then
    return null;
  else
    perform public.fogon_bot_enqueue(new.channel_id, v_bot, 'dale señor, te los mando por privado 📬', new.id, interval '1 second');
  end if;
  perform public.fogon_gonza_modlog_send(v_owner, case when new.content ~* 'semana|7 d[ií]as' then 7 else 1 end);
  return null;
end $$;
revoke execute on function public.fogon_gonza_modlog_on_message() from public, anon, authenticated;
create or replace trigger fogon_gonza_modlog after insert on public.fogon_messages for each row execute function public.fogon_gonza_modlog_on_message();

-- que el bot no conteste además con una frase cualquiera a ese pedido por privado
do $$
declare def text := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
begin
  def := replace(def, '    if bot is null then return null; end if;
    if v_bot = ''sofi'' then', '    if bot is null then return null; end if;
    if v_bot = ''gonza.bot'' and public.fogon_gonza_wants_modlog(new.content) and new.author_id = ''e7809edc-8559-4df6-8d2b-1fffc7a27719'' then return null; end if;
    if v_bot = ''sofi'' then');
  def := replace(def, '    if bot = ''7c1d1f00-0000-4000-8000-0000000060a1'' then
      v_body := public.fogon_bot_line(', '    if bot = ''7c1d1f00-0000-4000-8000-0000000060a1'' and new.author_id = ''e7809edc-8559-4df6-8d2b-1fffc7a27719'' and public.fogon_gonza_wants_modlog(new.content) then
      return null;
    elsif bot = ''7c1d1f00-0000-4000-8000-0000000060a1'' then
      v_body := public.fogon_bot_line(');
  if position('elsif bot = ''7c1d1f00' in def) = 0 then raise exception 'no pude ajustar la mención de gonza.bot'; end if;
  if position('fogon_gonza_wants_modlog' in def) = 0 then raise exception 'no pude ajustar fogon_bot_on_message'; end if;
  execute def;
end $$;

-- por voz: "gonza, dame los registros de moderación"
do $$
declare def text := pg_get_functiondef('public.fogon_bot_voice_say'::regproc);
begin
  def := replace(def, '  if exists (select 1 from public.fogon_voice_talk where channel_id = p_channel and at > now() - interval ''3 seconds'') then return null; end if;',
'  if exists (select 1 from public.fogon_voice_talk where channel_id = p_channel and at > now() - interval ''3 seconds'') then return null; end if;
  if auth.uid() = ''e7809edc-8559-4df6-8d2b-1fffc7a27719'' and public.fogon_gonza_wants_modlog(t)
     and exists (select 1 from public.fogon_bot_voice where bot_id = ''7c1d1f00-0000-4000-8000-0000000060a1'' and channel_id = p_channel) then
    perform public.fogon_gonza_modlog_send(auth.uid(), case when t ~ ''semana|7 d[ií]as'' then 7 else 1 end);
    v_bot := ''7c1d1f00-0000-4000-8000-0000000060a1'';
    v_reply := ''dale señor, te mando los registros por privado'';
    insert into public.fogon_voice_talk (channel_id, at) values (p_channel, now()) on conflict (channel_id) do update set at = now();
    perform realtime.send(jsonb_build_object(''bot_id'', v_bot, ''text'', v_reply), ''bot_say'', ''fogon-voice:'' || p_channel, true);
    return jsonb_build_object(''bot_id'', v_bot, ''text'', v_reply);
  end if;');
  if position('fogon_gonza_wants_modlog' in def) = 0 then raise exception 'no pude ajustar fogon_bot_voice_say'; end if;
  execute def;
end $$;
