-- Modo prueba de la moderación de voz: el staff puede probarla con su cuenta.
-- Detecta, contesta y lo anota en #registro-mod como "(prueba)", pero no silencia ni aísla.
drop function if exists public.fogon_voice_mod_heard(uuid, text);
create or replace function public.fogon_voice_mod_heard(p_channel uuid, p_text text, p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  v_log uuid := '7c1d1f00-0000-4000-8000-00000000cc02';
  vc_text uuid := '465a45e0-5cb0-4ccb-ba92-fd9ccd873bca';
  me uuid := auth.uid(); t text := lower(btrim(coalesce(p_text, ''))); ch record; v_name text; v_user text; n int; v_kind text; v_line text; v_did text;
  v_test boolean;
begin
  if me is null or length(t) < 2 then return null; end if;
  select id, server_id, name into ch from public.fogon_channels where id = p_channel and kind = 'voice';
  if ch.id is null or ch.server_id is distinct from community then return null; end if;
  if not exists (select 1 from public.fogon_bot_voice where bot_id = v_bot and channel_id = p_channel) then return null; end if;
  v_test := public.fogon_is_staff(community, me);
  if v_test and not coalesce(p_test, false) then return null; end if; -- al staff no lo modera (salvo en modo prueba)
  if t !~* '(\mhdp\M|hij[oa] de (re )?puta|la concha de tu|conchud[oa]|pelotud[oa]|\mforr[oa]s?\M|mog[oó]lic[oa]|retrasad[oa]|\msorete|\mput[oa]s?\M|maric[oó]n|\mtrol[oa]s?\M|negr[oa]s? de mierda|\mkys\M|matate|suicidate|and[aá] a morirte)' then
    return jsonb_build_object('moderated', false);
  end if;

  insert into public.fogon_automod_log (server_id, user_id, channel_id, reason, content)
  values (community, me, p_channel, case when v_test then 'insultos en voz (prueba)' else 'insultos en voz' end, left(t, 300));
  select count(*) into n from public.fogon_automod_log where server_id = community and user_id = me
    and reason = case when v_test then 'insultos en voz (prueba)' else 'insultos en voz' end and at > now() - interval '15 minutes';
  if v_test and n > 3 then
    -- en prueba vuelve a empezar después del tercero
    delete from public.fogon_automod_log where server_id = community and user_id = me and reason = 'insultos en voz (prueba)';
    insert into public.fogon_automod_log (server_id, user_id, channel_id, reason, content) values (community, me, p_channel, 'insultos en voz (prueba)', left(t, 300));
    n := 1;
  end if;
  select display_name, username into v_name, v_user from public.fogon_profiles where id = me;

  perform set_config('request.jwt.claim.sub', v_bot::text, true);
  if n >= 3 then
    v_kind := 'vc_kick'; v_did := 'aislado 10 minutos';
    if not v_test then
      insert into public.fogon_timeouts (server_id, user_id, until, reason, by_id, at) values (community, me, now() + interval '10 minutes', 'insultos en voz', v_bot, now())
      on conflict (server_id, user_id) do update set until = excluded.until, reason = excluded.reason, by_id = excluded.by_id, at = excluded.at;
    end if;
  elsif n = 2 then
    v_kind := 'vc_mute'; v_did := 'silenciado 2 minutos';
    if not v_test then
      insert into public.fogon_voice_mods (server_id, user_id, muted, deafened, by_id, at) values (community, me, true, false, v_bot, now())
      on conflict (server_id, user_id) do update set muted = true, by_id = v_bot, at = now();
      insert into public.fogon_voice_unmute (server_id, user_id, at) values (community, me, now() + interval '2 minutes')
      on conflict (server_id, user_id) do update set at = excluded.at;
    end if;
  else
    v_kind := 'vc_warn'; v_did := 'aviso';
  end if;
  if v_test then v_did := v_did || ', prueba: no se aplicó'; end if;

  select replace(l.body, '{n}', coalesce(v_name, '')) into v_line from public.fogon_bot_dm_lines l where l.bot = 'gonza.bot' and l.kind = v_kind order by random() limit 1;
  insert into public.fogon_voice_talk (channel_id, at) values (p_channel, now()) on conflict (channel_id) do update set at = now();
  perform realtime.send(jsonb_build_object('bot_id', v_bot, 'text', v_line), 'bot_say', 'fogon-voice:' || p_channel, true);
  if n >= 2 and not v_test then perform public.fogon_bot_enqueue(vc_text, v_bot, '🛡️ @' || v_user || ' ' || v_did || ' por insultos en la sala de voz.', null, interval '1 second'); end if;
  perform public.fogon_bot_enqueue(v_log, v_bot, '🎙️ **@' || v_user || '** en 🔊 ' || ch.name || ' — insultos en voz (' || v_did || ', ' || n || '/3)' || chr(10) || '> ' || replace(left(t, 200), chr(10), ' '), null, interval '1 second');
  return jsonb_build_object('moderated', true, 'bot_id', v_bot, 'text', v_line, 'action', v_kind, 'test', v_test, 'step', n);
end $$;
revoke execute on function public.fogon_voice_mod_heard(uuid, text, boolean) from public, anon;
grant execute on function public.fogon_voice_mod_heard(uuid, text, boolean) to authenticated;
