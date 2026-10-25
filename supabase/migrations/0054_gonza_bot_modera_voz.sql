-- gonza.bot modera las salas de voz de la comunidad y habla como gonza.
--  * Va solo a la sala de voz donde hay gente (y se va cuando queda vacía).
--  * Mientras está, el navegador de cada uno pasa a texto lo que dice (se avisa en la sala) y la base
--    revisa si hay insultos: 1.º aviso hablado, 2.º silenciado 2 minutos, 3.º aislado 10 minutos.
--    No se guarda lo que se dice: solo el pedacito que se moderó, como con los mensajes.
--  * En la llamada contesta con frases de gonza (las de siempre y las que aprendió).

-- quién está en cada canal de voz (el navegador avisa cada ~45 s mientras está conectado)
create table if not exists public.fogon_voice_here (
  user_id uuid primary key references public.fogon_profiles (id) on delete cascade,
  channel_id uuid not null references public.fogon_channels (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.fogon_voice_here enable row level security;
revoke all on public.fogon_voice_here from anon, authenticated;

create or replace function public.fogon_voice_here(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if p_channel is null then
    delete from public.fogon_voice_here where user_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.fogon_channels where id = p_channel and kind = 'voice') or not public.fogon_can_read(p_channel) then return; end if;
  insert into public.fogon_voice_here (user_id, channel_id, at) values (auth.uid(), p_channel, now())
  on conflict (user_id) do update set channel_id = excluded.channel_id, at = now();
end $$;
revoke execute on function public.fogon_voice_here(uuid) from public, anon;
grant execute on function public.fogon_voice_here(uuid) to authenticated;

-- desilenciar cuando se cumple el tiempo
create table if not exists public.fogon_voice_unmute (
  server_id uuid not null references public.fogon_servers (id) on delete cascade,
  user_id uuid not null references public.fogon_profiles (id) on delete cascade,
  at timestamptz not null,
  primary key (server_id, user_id)
);
alter table public.fogon_voice_unmute enable row level security;
revoke all on public.fogon_voice_unmute from anon, authenticated;

-- frases de gonza para la llamada
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('gonza.bot', 'vc_greet', 'buenas buenas, qué onda'), ('gonza.bot', 'vc_greet', 'eu {n}, todo bien?'), ('gonza.bot', 'vc_greet', 'holaa 🧉'),
  ('gonza.bot', 'vc_hear', 'si si, te escucho re bien'), ('gonza.bot', 'vc_hear', 'fuerte y claro'), ('gonza.bot', 'vc_hear', 'te escucho, dale'),
  ('gonza.bot', 'vc_bot', 'jaja si, soy el bot de gonza. el posta anda por ahí'), ('gonza.bot', 'vc_bot', 'soy el gemelo bot de gonza 🤖'),
  ('gonza.bot', 'vc_game', 'dale, armen que miro'), ('gonza.bot', 'vc_game', 'yo modero, ustedes jueguen jaja'),
  ('gonza.bot', 'vc_question', 'mmm buena pregunta'), ('gonza.bot', 'vc_question', 'ni idea, preguntale a gonza'), ('gonza.bot', 'vc_question', 'creo que si'),
  ('gonza.bot', 'vc_fallback', 'jaja re'), ('gonza.bot', 'vc_fallback', 'que bueno'), ('gonza.bot', 'vc_fallback', 'posta?'), ('gonza.bot', 'vc_fallback', 'TD BIEN'),
  ('gonza.bot', 'vc_bye', 'chau {n}, nos vemos'), ('gonza.bot', 'vc_bye', 'dale, después hablamos'),
  ('gonza.bot', 'vc_warn', 'eu {n}, tranqui con eso. acá se habla bien'), ('gonza.bot', 'vc_warn', '{n}, bajale un cambio que hay gente'), ('gonza.bot', 'vc_warn', 'ojo {n}, sin insultos en la sala eh'),
  ('gonza.bot', 'vc_mute', '{n}, te silencio un par de minutos. respirá y volvé'), ('gonza.bot', 'vc_mute', 'listo {n}, dos minutos en silencio, después seguimos'),
  ('gonza.bot', 'vc_kick', '{n}, afuera un rato. te aislé diez minutos'), ('gonza.bot', 'vc_kick', 'bueno {n}, ya avisé dos veces. diez minutos afuera'),
  ('gonza.bot', 'vc_join', 'eu, ¿qué onda la sala? me quedo a moderar 🛡️'), ('gonza.bot', 'vc_join', 'buenas, caigo un rato 🧉'), ('gonza.bot', 'vc_join', 'llegó el que faltaba jaja');

-- lo que dice alguien en la sala (pasado a texto en su navegador): revisa insultos y sanciona
create or replace function public.fogon_voice_mod_heard(p_channel uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  v_log uuid := '7c1d1f00-0000-4000-8000-00000000cc02';
  vc_text uuid := '465a45e0-5cb0-4ccb-ba92-fd9ccd873bca';
  me uuid := auth.uid(); t text := lower(btrim(coalesce(p_text, ''))); ch record; v_name text; v_user text; n int; v_kind text; v_line text; v_did text;
begin
  if me is null or length(t) < 2 then return null; end if;
  select id, server_id, name into ch from public.fogon_channels where id = p_channel and kind = 'voice';
  if ch.id is null or ch.server_id is distinct from community then return null; end if;
  if not exists (select 1 from public.fogon_bot_voice where bot_id = v_bot and channel_id = p_channel) then return null; end if;
  if public.fogon_is_staff(community, me) then return null; end if;
  if t !~* '(\mhdp\M|hij[oa] de (re )?puta|la concha de tu|conchud[oa]|pelotud[oa]|\mforr[oa]s?\M|mog[oó]lic[oa]|retrasad[oa]|\msorete|\mput[oa]s?\M|maric[oó]n|\mtrol[oa]s?\M|negr[oa]s? de mierda|\mkys\M|matate|suicidate|and[aá] a morirte)' then
    return jsonb_build_object('moderated', false);
  end if;

  insert into public.fogon_automod_log (server_id, user_id, channel_id, reason, content) values (community, me, p_channel, 'insultos en voz', left(t, 300));
  select count(*) into n from public.fogon_automod_log where server_id = community and user_id = me and reason = 'insultos en voz' and at > now() - interval '15 minutes';
  select display_name, username into v_name, v_user from public.fogon_profiles where id = me;

  -- lo que sigue lo hace gonza.bot (así queda él en el registro de auditoría)
  perform set_config('request.jwt.claim.sub', v_bot::text, true);
  if n >= 3 then
    v_kind := 'vc_kick'; v_did := 'aislado 10 minutos';
    insert into public.fogon_timeouts (server_id, user_id, until, reason, by_id, at) values (community, me, now() + interval '10 minutes', 'insultos en voz', v_bot, now())
    on conflict (server_id, user_id) do update set until = excluded.until, reason = excluded.reason, by_id = excluded.by_id, at = excluded.at;
  elsif n = 2 then
    v_kind := 'vc_mute'; v_did := 'silenciado 2 minutos';
    insert into public.fogon_voice_mods (server_id, user_id, muted, deafened, by_id, at) values (community, me, true, false, v_bot, now())
    on conflict (server_id, user_id) do update set muted = true, by_id = v_bot, at = now();
    insert into public.fogon_voice_unmute (server_id, user_id, at) values (community, me, now() + interval '2 minutes')
    on conflict (server_id, user_id) do update set at = excluded.at;
  else
    v_kind := 'vc_warn'; v_did := 'aviso';
  end if;

  select replace(l.body, '{n}', coalesce(v_name, '')) into v_line from public.fogon_bot_dm_lines l where l.bot = 'gonza.bot' and l.kind = v_kind order by random() limit 1;
  insert into public.fogon_voice_talk (channel_id, at) values (p_channel, now()) on conflict (channel_id) do update set at = now();
  perform realtime.send(jsonb_build_object('bot_id', v_bot, 'text', v_line), 'bot_say', 'fogon-voice:' || p_channel, true);
  if n >= 2 then perform public.fogon_bot_enqueue(vc_text, v_bot, '🛡️ @' || v_user || ' ' || v_did || ' por insultos en la sala de voz.', null, interval '1 second'); end if;
  perform public.fogon_bot_enqueue(v_log, v_bot, '🎙️ **@' || v_user || '** en 🔊 ' || ch.name || ' — insultos en voz (' || v_did || ', ' || n || '/3)' || chr(10) || '> ' || replace(left(t, 200), chr(10), ' '), null, interval '1 second');
  return jsonb_build_object('moderated', true, 'bot_id', v_bot, 'text', v_line, 'action', v_kind);
end $$;
revoke execute on function public.fogon_voice_mod_heard(uuid, text) from public, anon;
grant execute on function public.fogon_voice_mod_heard(uuid, text) to authenticated;

-- gonza.bot va a la sala con gente, se va cuando queda vacía, y desilencia a los que cumplieron
create or replace function public.fogon_gonza_voice_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  vc_text uuid := '465a45e0-5cb0-4ccb-ba92-fd9ccd873bca';
  r record; v_best uuid; v_cur uuid; v_line text;
begin
  perform set_config('request.jwt.claim.sub', v_bot::text, true);
  delete from public.fogon_voice_here where at < now() - interval '3 minutes';

  for r in select * from public.fogon_voice_unmute where at <= now() loop
    update public.fogon_voice_mods set muted = false, by_id = v_bot, at = now() where server_id = r.server_id and user_id = r.user_id;
    delete from public.fogon_voice_unmute where server_id = r.server_id and user_id = r.user_id;
  end loop;

  -- la sala abierta con más gente (personas, no bots)
  select h.channel_id into v_best from public.fogon_voice_here h
  join public.fogon_channels c on c.id = h.channel_id and c.server_id = community and c.kind = 'voice'
  join public.fogon_profiles p on p.id = h.user_id and not p.is_bot
  where c.id <> '7c1d1f00-0000-4000-8000-00000000d002'
    and not exists (select 1 from public.fogon_channel_overrides o where o.role_id is null and 'view_channel' = any(o.deny) and o.channel_id in (c.id, c.parent_id))
  group by h.channel_id order by count(*) desc, max(h.at) desc limit 1;

  select channel_id into v_cur from public.fogon_bot_voice where bot_id = v_bot;
  if v_best is null then
    -- se va si hace 5 minutos que no queda nadie
    if v_cur is not null and not exists (select 1 from public.fogon_voice_here where channel_id = v_cur and at > now() - interval '5 minutes') then
      update public.fogon_bot_voice set channel_id = null, since = null, leave_at = null, left_at = now() where bot_id = v_bot;
      update public.fogon_profiles set custom_status = '🤖 el gemelo de @gonza' where id = v_bot;
    end if;
    return;
  end if;
  if v_cur is distinct from v_best then
    insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, since, leave_at)
    values (v_bot, v_best, false, false, now(), now() + interval '100 years')
    on conflict (bot_id) do update set channel_id = excluded.channel_id, muted = false, deafened = false, since = now(), leave_at = excluded.leave_at, afk_until = null;
    update public.fogon_profiles set status = 'online', custom_status = '🛡️ moderando la voz' where id = v_bot;
    if v_cur is null then
      select l.body into v_line from public.fogon_bot_dm_lines l where l.bot = 'gonza.bot' and l.kind = 'vc_join' order by random() limit 1;
      perform realtime.send(jsonb_build_object('bot_id', v_bot, 'text', v_line), 'bot_say', 'fogon-voice:' || v_best, true);
      if random() < 0.5 then perform public.fogon_bot_enqueue(vc_text, v_bot, v_line, null, interval '2 seconds'); end if;
    end if;
  end if;
end $$;
revoke execute on function public.fogon_gonza_voice_tick() from public, anon, authenticated;
select cron.schedule('fogon-gonza-voz', '* * * * *', 'select public.fogon_gonza_voice_tick()');

-- en la llamada, gonza.bot contesta con frases de gonza (las de la llamada, las de siempre o las aprendidas)
do $$
declare def text := pg_get_functiondef('public.fogon_bot_voice_say'::regproc);
begin
  def := replace(def, '  select l.body into v_reply from public.fogon_bot_dm_lines l where l.kind = v_kind order by random() limit 1;',
'  if v_bot = ''7c1d1f00-0000-4000-8000-0000000060a1'' then
    select l.body into v_reply from public.fogon_bot_dm_lines l where l.bot = ''gonza.bot'' and l.kind = v_kind order by random() limit 1;
    if v_reply is null or (v_kind = ''vc_fallback'' and random() < 0.5) then
      select body into v_reply from public.fogon_gonza_phrases where length(body) <= 80 order by random() * (case when learned then 1 else 1.6 end) limit 1;
    end if;
  else
    select l.body into v_reply from public.fogon_bot_dm_lines l where l.kind = v_kind and l.bot = ''*'' order by random() limit 1;
  end if;');
  if position('0000000060a1' in def) = 0 then raise exception 'no pude ajustar fogon_bot_voice_say'; end if;
  execute def;
end $$;
