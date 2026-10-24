-- 1) Los bots que están en un canal de voz te contestan cuando hablás (si activás "Los bots me escuchan"):
--    tu navegador pasa lo que dijiste a texto, la base elige qué bot contesta y qué dice, y se lo manda
--    a todos los de la llamada por el canal privado de voz; cada uno lo escucha con la voz del navegador.
-- 2) Leído en un dispositivo = leído en todos: los cambios de fogon_read_states llegan por Realtime.

alter publication supabase_realtime add table public.fogon_read_states;

create table if not exists public.fogon_voice_talk (channel_id uuid primary key, at timestamptz not null default now());
alter table public.fogon_voice_talk enable row level security;

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('*', 'vc_greet', 'eyy {n}! qué onda, todo bien?'),
  ('*', 'vc_greet', 'holaa {n}, te escucho joya'),
  ('*', 'vc_greet', 'buenas {n}! bienvenido a la llamada'),
  ('*', 'vc_hear', 'sí, te escucho perfecto'),
  ('*', 'vc_hear', 'fuerte y claro'),
  ('*', 'vc_game', 'dale, jugamos una? yo estoy listo'),
  ('*', 'vc_game', 'arranquemos que se hace tarde jaja'),
  ('*', 'vc_bot', 'jaja sí, soy un bot, por eso hablo con esta voz de robot'),
  ('*', 'vc_bye', 'dale {n}, nos vemos, abrazo'),
  ('*', 'vc_fallback', 'jaja tal cual'),
  ('*', 'vc_fallback', 'posta, re'),
  ('*', 'vc_fallback', 'uh, mirá vos'),
  ('*', 'vc_fallback', 'jajaja no te puedo creer'),
  ('*', 'vc_fallback', 'ah re, coincido'),
  ('*', 'vc_fallback', 'qué bueno eso'),
  ('*', 'vc_question', 'mmm no sé, vos qué decís?'),
  ('*', 'vc_question', 'creo que sí, pero no estoy seguro');

-- la llama tu navegador con lo que dijiste (ya pasado a texto)
create or replace function public.fogon_bot_voice_say(p_channel uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t text := lower(trim(coalesce(p_text, '')));
  v_bot uuid; v_name text; v_kind text; v_reply text; v_user text;
begin
  if auth.uid() is null or length(t) < 2 then return null; end if;
  if not exists (select 1 from public.fogon_channels where id = p_channel and kind = 'voice') or not public.fogon_can_read(p_channel) then return null; end if;
  -- uno a la vez por llamada (para que no se pisen)
  if exists (select 1 from public.fogon_voice_talk where channel_id = p_channel and at > now() - interval '3 seconds') then return null; end if;

  -- contesta el bot que nombraste, si no cualquiera de los que están (no los que están ausentes)
  select v.bot_id into v_bot from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id
  where v.channel_id = p_channel and v.afk_until is null
    and (t like '%' || lower(p.display_name) || '%' or t like '%' || split_part(p.username, '.', 1) || '%' or t like '%' || split_part(p.username, '_', 1) || '%')
  limit 1;
  if v_bot is null then
    -- si no nombró a nadie, no siempre contestan (como en una llamada de verdad)
    if random() > 0.7 then return null; end if;
    select v.bot_id into v_bot from public.fogon_bot_voice v where v.channel_id = p_channel and v.afk_until is null order by random() limit 1;
  end if;
  if v_bot is null then return null; end if;

  insert into public.fogon_voice_talk (channel_id, at) values (p_channel, now()) on conflict (channel_id) do update set at = now();

  v_kind := case
    when t ~ '(sos|eres|son) (un |unos )?(bot|robot|ia)' then 'vc_bot'
    when t ~ '(me (escuchan|escuch[aá]s|oyen)|se escucha|me escucha)' then 'vc_hear'
    when t ~ '^(hola|buenas|holis|ey|qu[eé] onda|buen d[ií]a|buenas noches)' then 'vc_greet'
    when t ~ '(chau|nos vemos|me voy|me desconecto)' then 'vc_bye'
    when t ~ '(juguemos|jugamos|una partida|arranquemos|dale que)' then 'vc_game'
    when t ~ '\?\s*$|^(qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|por qu[eé]|qui[eé]n)\M' then 'vc_question'
    else 'vc_fallback' end;
  select l.body into v_reply from public.fogon_bot_dm_lines l where l.kind = v_kind order by random() limit 1;
  select display_name into v_name from public.fogon_profiles where id = auth.uid();
  v_reply := replace(v_reply, '{n}', coalesce(v_name, ''));

  -- a todos los de la llamada
  perform realtime.send(jsonb_build_object('bot_id', v_bot, 'text', v_reply), 'bot_say', 'fogon-voice:' || p_channel, true);
  return jsonb_build_object('bot_id', v_bot, 'text', v_reply);
end $$;
revoke execute on function public.fogon_bot_voice_say(uuid, text) from public, anon;
grant execute on function public.fogon_bot_voice_say(uuid, text) to authenticated;
