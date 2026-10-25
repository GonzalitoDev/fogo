-- La Comunidad de Fogón se arma y se mantiene ordenada sola, con la estructura del servidor oficial de Discord:
-- INFORMACIÓN · COMUNIDAD · INTERESES · EVENTOS · AYUDA · CANALES DE VOZ · STAFF (+ administracion, privada).
-- No borra nada: busca cada canal por su nombre (sin el emoji de Lu), lo mueve a su categoría y su lugar,
-- crea los que faltan y deja donde están los que no conoce. Corre todos los días a las 5 y una vez ya.

-- emojis de Lu para los canales nuevos
create or replace function public.fogon_deco_emoji(p_name text, p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when n ~ 'informaci' then 'ℹ️' when n ~ 'comunidad' then '🏡' when n ~ 'inter[eé]s' then '⭐' when n ~ 'escenario' then '🎤'
    when n ~ 'presenta' then '🙋' when n ~ 'bug' then '🐛'
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

-- nombre de un canal sin la decoración (para reconocerlo aunque Lu le haya puesto emoji)
create or replace function public.fogon_chan_base(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select lower(coalesce(d.base, regexp_replace(c.name, '^[^[:alnum:]]+(┃\s*)?', '')))
  from public.fogon_channels c left join public.fogon_deco d on d.channel_id = c.id where c.id = p_id
$$;
revoke execute on function public.fogon_chan_base(uuid) from public, anon, authenticated;

-- cambia el nombre base de un canal y lo deja decorado como lo haría Lu
create or replace function public.fogon_chan_rebase(p_id uuid, p_base text)
returns void language plpgsql security definer set search_path = '' as $$
declare c record; v_emoji text; v_name text;
begin
  select * into c from public.fogon_channels where id = p_id;
  v_emoji := public.fogon_deco_emoji(p_base, c.kind);
  v_name := case when c.kind = 'category' then coalesce(public.fogon_deco_season(), v_emoji) || ' ' || p_base else v_emoji || '┃' || p_base end;
  insert into public.fogon_deco (channel_id, base, emoji, last_name) values (p_id, p_base, v_emoji, v_name)
  on conflict (channel_id) do update set base = excluded.base, emoji = excluded.emoji, last_name = excluded.last_name, at = now();
  update public.fogon_channels set name = v_name where id = p_id;
end $$;
revoke execute on function public.fogon_chan_rebase(uuid, text) from public, anon, authenticated;

create or replace function public.fogon_community_layout()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  oficial uuid := '7c1d1f00-0000-4000-8000-00000000f001';
  cm_role uuid := '7c1d1f00-0000-4000-8000-00000000ca02';
  -- categoría (nombre, nombres viejos) y sus canales: [tipo, nombre, nombres viejos, tema, solo lectura]
  plan jsonb := '[
    {"cat": "INFORMACIÓN", "old": ["bienvenida", "información", "informacion", "info"], "ro": true, "chans": [
      ["text", "bienvenida", [], "Arrancá por acá 👋", false],
      ["text", "reglas", ["normas"], "Las reglas de la comunidad. Leelas antes de escribir 📜", false],
      ["text", "anuncios", [], "Lo importante de Fogón 📣", false],
      ["text", "novedades", [], "Todo lo nuevo de Fogón, apenas sale 🔥", false]]},
    {"cat": "COMUNIDAD", "old": ["charla", "general", "comunidad"], "ro": false, "chans": [
      ["text", "general", [], "Para charlar de todo 💬", false],
      ["text", "presentaciones", ["presentate"], "Contanos quién sos 🙋", false],
      ["text", "memes", [], "Memes y cosas graciosas 😂", false]]},
    {"cat": "INTERESES", "old": ["intereses", "temas"], "ro": false, "chans": [
      ["text", "juegos", [], "Videojuegos, partidas y torneos 🎮", false],
      ["text", "música", ["musica"], "Temas, recomendaciones y lo que estás escuchando 🎵", false],
      ["text", "programación", ["programacion", "code"], "Código, proyectos y dudas de programación 💻", false],
      ["text", "arte", ["dibujos"], "Dibujos, diseños y todo lo que hagas 🎨", false]]},
    {"cat": "EVENTOS", "old": ["eventos"], "ro": false, "chans": [
      ["text", "eventos", [], "Torneos, noches de juegos y juntadas 🎉", true],
      ["voice", "Escenario", [], "", false]]},
    {"cat": "AYUDA", "old": ["ayuda", "soporte"], "ro": false, "chans": [
      ["text", "ayuda-fogón", ["ayuda-fogon", "ayuda", "soporte"], "Dudas sobre cómo usar Fogón 🆘", false],
      ["text", "sugerencias", ["ideas"], "¿Qué le agregarías a Fogón? 💡", false],
      ["text", "reportar-bugs", ["bugs", "errores"], "Si algo no anda, contalo acá 🐛", false]]},
    {"cat": "CANALES DE VOZ", "old": ["canales de voz", "voz"], "ro": false, "chans": [
      ["text", "vc", [], "El chat de los que están en voz 🎙️", false],
      ["voice", "Fogón", ["fogon"], "", false],
      ["voice", "Gaming", [], "", false],
      ["voice", "Radio 24/7", ["📻 radio 24/7"], "", false],
      ["voice", "PRIVADO", [], "", false]]},
    {"cat": "STAFF", "old": ["staff"], "ro": false, "chans": [
      ["text", "registro-mod", [], "", false],
      ["voice", "noticiasinformatica", ["🔴┃noticiasinformatica"], "", false]]},
    {"cat": "administracion", "old": ["administracion", "administración"], "ro": false, "chans": [
      ["text", "administracion", ["administración"], "", false],
      ["voice", "Staff", [], "", false]]}
  ]';
  g jsonb; ch jsonb; v_cat uuid; v_id uuid; i int := 0; j int; v_created text[] := '{}'; v_moved int := 0; v_old text[]; v_names text[];
begin
  perform set_config('request.jwt.claim.sub', oficial::text, true);
  perform set_config('fogon.deco', '1', true);

  for g in select * from jsonb_array_elements(plan) loop
    v_names := array(select lower(x) from jsonb_array_elements_text(g -> 'old') x) || lower(g ->> 'cat');
    select c.id into v_cat from public.fogon_channels c
    where c.server_id = community and c.kind = 'category' and public.fogon_chan_base(c.id) = any(v_names)
    order by (public.fogon_chan_base(c.id) = lower(g ->> 'cat')) desc, c.position limit 1;
    if v_cat is null then
      insert into public.fogon_channels (server_id, kind, name, topic, position) values (community, 'category', g ->> 'cat', '', i) returning id into v_cat;
      perform public.fogon_chan_rebase(v_cat, g ->> 'cat');
      v_created := v_created || (g ->> 'cat');
      if (g ->> 'ro')::boolean then
        insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values (community, v_cat, null, '{}', array['send_messages']);
      end if;
    else
      if public.fogon_chan_base(v_cat) <> lower(g ->> 'cat') then perform public.fogon_chan_rebase(v_cat, g ->> 'cat'); end if;
      update public.fogon_channels set position = i where id = v_cat and position <> i;
    end if;

    j := 0;
    for ch in select * from jsonb_array_elements(g -> 'chans') loop
      v_old := array(select lower(x) from jsonb_array_elements_text(ch -> 2) x) || lower(ch ->> 1);
      v_id := null;
      select c.id into v_id from public.fogon_channels c
      where c.server_id = community and c.kind = ch ->> 0 and (public.fogon_chan_base(c.id) = any(v_old) or lower(c.name) = any(v_old))
      order by coalesce(c.parent_id = v_cat, false) desc, c.position limit 1;
      if v_id is null then
        insert into public.fogon_channels (server_id, kind, name, topic, position, parent_id)
        values (community, ch ->> 0, ch ->> 1, coalesce(ch ->> 3, ''), j, v_cat) returning id into v_id;
        perform public.fogon_chan_rebase(v_id, ch ->> 1);
        v_created := v_created || (case when ch ->> 0 = 'voice' then '🔊 ' else '#' end || (ch ->> 1));
        if (ch ->> 4)::boolean then
          insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values (community, v_id, null, '{}', array['send_messages', 'create_threads', 'create_polls']);
          insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values (community, v_id, cm_role, array['send_messages'], '{}');
        end if;
      else
        if (select parent_id is distinct from v_cat or position <> j from public.fogon_channels where id = v_id) then
          update public.fogon_channels set parent_id = v_cat, position = j where id = v_id;
          v_moved := v_moved + 1;
        end if;
        update public.fogon_channels set topic = ch ->> 3 where id = v_id and coalesce(topic, '') = '' and coalesce(ch ->> 3, '') <> '';
      end if;
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;

  -- categorías que no están en el plan: van después (no se borra nada)
  update public.fogon_channels c set position = i + c.position
  where c.server_id = community and c.kind = 'category' and c.position < i
    and not (public.fogon_chan_base(c.id) = any(array(select lower(x ->> 'cat') from jsonb_array_elements(plan) x)));

  return jsonb_build_object('creados', v_created, 'movidos', v_moved);
end $$;
revoke execute on function public.fogon_community_layout() from public, anon, authenticated;

-- primera vez: arma todo y deja los mensajes de arranque en los canales nuevos
do $$
declare
  r jsonb; v_reglas uuid; mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01'; oficial uuid := '7c1d1f00-0000-4000-8000-00000000f001';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2'; v_id uuid; m uuid;
begin
  r := public.fogon_community_layout();
  raise notice 'layout: %', r;
  if exists (select 1 from public.fogon_deco_state where k = 'layout_seeded') then return; end if;
  insert into public.fogon_deco_state (k, v) values ('layout_seeded', now()::text);

  select id into v_reglas from public.fogon_channels where server_id = community and public.fogon_chan_base(id) = 'reglas' and kind = 'text';
  if v_reglas is not null and not exists (select 1 from public.fogon_messages where channel_id = v_reglas) then
    insert into public.fogon_messages (channel_id, author_id, content) values (v_reglas, oficial,
      '📜 **Reglas de la Comunidad de Fogón**' || chr(10) || chr(10) ||
      '**1.** Respeto ante todo: nada de insultos, acoso ni discriminación.' || chr(10) ||
      '**2.** Sin spam, flood ni publicidad sin permiso.' || chr(10) ||
      '**3.** Nada de contenido para adultos, violento o ilegal.' || chr(10) ||
      '**4.** Cada tema en su canal: memes en #memes, juegos en #juegos, dudas en #ayuda-fogón.' || chr(10) ||
      '**5.** No compartas datos personales tuyos ni de otros.' || chr(10) ||
      '**6.** En voz también: gonza.bot modera las salas y el Guardián los mensajes.' || chr(10) ||
      '**7.** Si ves algo raro, avisale a @mica.cm por privado.' || chr(10) || chr(10) ||
      'Romper las reglas puede terminar en aislamiento o ban. ¡Pasala bien! 🔥')
    returning id into m;
    update public.fogon_messages set pinned_at = now(), pinned_by = oficial where id = m;
  end if;

  for v_id, r in
    select c.id, to_jsonb(x.body) from (values
      ('presentaciones', '¡Hola! 🙋 Este es el lugar para **presentarte**: cómo te llamás, de dónde sos, qué te gusta jugar o escuchar. ¡Bienvenidos!'),
      ('arte', '🎨 Canal nuevo para mostrar **dibujos, diseños, fotos y todo lo que hagan**. ¡Quiero ver lo que tienen!'),
      ('eventos', '🎉 Acá vamos a anunciar **torneos, noches de juegos y juntadas en voz**. Si tenés una idea de evento, dejala en #sugerencias.'),
      ('sugerencias', '💡 ¿Qué le agregarías a Fogón? Dejá tu idea acá y reaccionen con 👍 a las que más les gusten. Las mejores llegan a gonza 😉'),
      ('reportar-bugs', '🐛 ¿Algo no anda? Contanos **qué pasó, qué estabas haciendo y desde qué dispositivo**. Si podés, sumá una captura.')
    ) x(base, body) join public.fogon_channels c on c.server_id = community and c.kind = 'text' and public.fogon_chan_base(c.id) = x.base
    where not exists (select 1 from public.fogon_messages where channel_id = c.id)
  loop
    perform public.fogon_bot_enqueue(v_id, mica, r #>> '{}', null, make_interval(secs => 5 + random() * 20));
  end loop;
end $$;

-- se reacomoda sola todos los días a las 5 (hora de Argentina)
select cron.schedule('fogon-comunidad-orden', '0 8 * * *', 'select public.fogon_community_layout()');

-- gonza.bot no tira frases sueltas en los canales de información, eventos, sugerencias ni bugs
do $$
declare def text := pg_get_functiondef('public.fogon_gonza_bot_tick'::regproc);
begin
  def := replace(def, '(bienvenida|anuncio|registro|ticket|cerrado|noticia)', '(bienvenida|anuncio|registro|ticket|cerrado|noticia|regla|novedad|evento|sugerencia|bug|administraci)');
  if position('novedad' in def) = 0 then raise exception 'no pude ajustar fogon_gonza_bot_tick'; end if;
  execute def;
end $$;
