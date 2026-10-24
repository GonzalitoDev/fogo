-- Los bots charlan entre ellos: conversaciones de varios turnos (no frases sueltas), con huecos que se
-- llenan al azar ({serie}, {comida}, {juego}…) para que no salgan iguales, y rotación para no repetir.
-- Si alguien de verdad escribe en el medio, los bots le contestan como siempre.

create table if not exists public.fogon_bot_convos (
  id serial primary key,
  tag text not null,         -- canal: general, memes, musica, juegos, programacion
  turns text[] not null      -- 'A|texto', 'B|texto'… ({A} {B} {C} = nombres de los que charlan)
);
alter table public.fogon_bot_convos enable row level security;

create table if not exists public.fogon_bot_convo_runs (
  id bigserial primary key,
  convo_id int not null,
  channel_id uuid not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists fogon_bot_convo_runs_ch on public.fogon_bot_convo_runs (channel_id, ends_at desc);
alter table public.fogon_bot_convo_runs enable row level security;

insert into public.fogon_bot_convos (tag, turns) values
-- general
('general', array['A|alguien vio {serie}? recién la termino', 'B|siii, el final me dejó re manija', 'A|NO me spoilees que me falta el último capítulo', 'B|jaja tranqui, no digo nada. solo te digo: preparate', 'C|yo la dejé en la segunda temporada, ¿vale la pena seguir?', 'B|banca, que después mejora mucho', 'A|confirmo, {C}, seguila']),
('general', array['A|hoy {comida} en casa 🤤', 'B|uh qué envidia, yo almuerzo un yogur', 'A|jajaja te guardo un poco', 'C|invitame {A}, llevo la bebida', 'A|dale, cae a las 13', 'B|¿y yo qué? ¿no estoy invitado? 😤', 'A|vengan todos, hay de sobra']),
('general', array['A|¿mate dulce o amargo? necesito saber con quién estoy hablando', 'B|amargo, obvio', 'C|dulce y no me arrepiento', 'B|{C} no te puedo creer', 'A|jajaja se armó', 'C|el mate dulce es para gente feliz, nada más']),
('general', array['A|buenas gente, ¿cómo viene el día?', 'B|tranqui, acá laburando', 'C|yo recién me levanto jaja', 'A|{C} son las {hora} 😂', 'C|es sábado en mi corazón', 'B|ídolo']),
('general', array['A|si pudieran irse de viaje mañana, ¿a dónde van?', 'B|{lugar} sin dudarlo', 'C|yo a cualquier lugar con playa', 'A|{lugar}… buena elección {B}', 'B|el año pasado fui y quedé enamorado', 'C|bueno, armemos un viaje del fogón']),
('general', array['A|¿cuál es la mejor peli argentina? digo {peli}', 'B|buena, pero para mí Nueve Reinas', 'C|El secreto de sus ojos y no se discute más', 'A|ok son las tres buenísimas, empate técnico', 'B|un clásico del fogón: discutir y terminar de acuerdo']),
('general', array['A|me compré un {animal} de peluche y no sé qué nombre ponerle', 'B|Carpi', 'C|Don {B}', 'A|jajaja Don {B} me encanta', 'B|me siento honrado 🥹']),
('general', array['A|che, ¿alguien sabe si mañana llueve?', 'B|dicen que sí a la tarde', 'C|perfecto para quedarse adentro con {serie}', 'A|o para hacer {comida}', 'C|o las dos cosas, sos un genio', 'B|plan aprobado']),
('general', array['A|confesión: nunca vi {peli}', 'B|¿QUÉ?', 'C|hoy noche de peli entonces', 'A|bueno bueno, la veo hoy y les cuento', 'B|después te esperamos para debatir', 'A|trato hecho']),
('general', array['A|estoy aburrido, cuéntenme algo', 'B|hoy vi un {animal} en la calle y me siguió dos cuadras', 'C|te adoptó', 'B|creo que sí jaja', 'A|ahora tenés que ponerle nombre', 'B|lo llamé Fogón, obviamente']),
-- memes
('memes', array['A|cuando decís "5 minutos más" y te despertás 3 horas después', 'B|literalmente yo hoy', 'C|el "5 minutos más" es una trampa', 'A|jajaja no aprendemos más']),
('memes', array['A|yo: voy a dormir temprano\nyo a {hora}: mirando videos de {animal}', 'B|JAJAJA me sentí atacado', 'C|los videos de {animal} son terapia', 'A|lo dijo la ciencia', 'B|bueno, uno más y me voy a dormir (mentira)']),
('memes', array['A|nadie:\nabsolutamente nadie:\nmi mamá: ¿comiste?', 'B|jajaja universal', 'C|y si decís que sí: ¿qué comiste?', 'A|y si decís {comida}: eso no es comida', 'B|me muero 😂']),
('memes', array['A|el wifi cuando estás por ganar: 📉', 'B|el wifi cuando no hacés nada: 🚀', 'C|el wifi tiene vida propia', 'A|y siempre te odia en el peor momento', 'B|demostrado científicamente']),
('memes', array['A|cuando el profe dice "esto no va a estar en el examen"', 'B|y está', 'C|y es lo único que está', 'A|jajajaja la traición', 'B|trauma colectivo']),
('memes', array['A|yo explicándole a mi abuela qué es Fogón', 'B|"es como un Facebook pero con fueguito"', 'C|JAJAJA', 'A|literal lo que dijo', 'B|la abuela tiene razón igual']),
('memes', array['A|"¿hacemos algo el finde?"\nel finde: se queda en casa', 'B|el clásico', 'C|el plan perfecto es el que no se hace', 'A|ese es el lema del fogón', 'B|jaja aprobado']),
-- música
('musica', array['A|recomiéndenme algo para escuchar que estoy re quemado', 'B|{banda}, siempre', 'C|apoyo, y después algo de {banda}', 'A|uh hace mil que no escucho', 'B|ponelo con !play en el canal de voz y lo escuchamos todos', 'A|dale, en un rato']),
('musica', array['A|¿mejor disco de {banda}?', 'B|uf qué pregunta difícil', 'C|el primero, sin discusión', 'B|nah, el último es mejor producido', 'A|se viene el debate', 'C|lo resolvemos escuchando los dos']),
('musica', array['A|fui a ver a {banda} en vivo y todavía no me recupero', 'B|¡qué envidia! ¿cómo estuvo?', 'A|una locura, cantamos todo', 'C|la próxima avisá que voy', 'A|hecho, vamos todos del fogón', 'B|armemos la bandera del fogón']),
('musica', array['A|tema que no puedo dejar de escuchar esta semana: algo de {banda}', 'B|buen gusto', 'C|yo estoy en loop con {banda}', 'A|qué variedad tenemos acá', 'B|eso es lo lindo del fogón']),
('musica', array['A|¿alguien toca algún instrumento?', 'B|guitarra, más o menos', 'C|yo batería, pero mis vecinos no me quieren', 'A|jajaja armemos una banda', 'B|se llama "{animal}s del Fogón"', 'C|me encanta, ya tenemos nombre']),
-- juegos
('juegos', array['A|¿quién se prende a unas de {juego} a la noche?', 'B|yo, después de las 22', 'C|me sumo si no me toca de support', 'A|{C} vos sos el mejor support que tenemos', 'C|por eso mismo 😤', 'B|jajaja dale, nos vemos en Gaming']),
('juegos', array['A|perdí 5 partidas seguidas de {juego}', 'B|mal día, dejalo por hoy', 'C|¿probaste culpar al equipo?', 'A|ya lo hice, no sirvió', 'B|entonces es momento de un mate y volver mañana']),
('juegos', array['A|¿juego favorito de la infancia?', 'B|el Counter en el ciber', 'C|Age of Empires, sin dudas', 'A|uff el ciber… qué épocas', 'B|$2 la hora y a gritar', 'C|y la PC del fondo que siempre andaba mal']),
('juegos', array['A|empecé {juego} y estoy enganchadísimo', 'B|¡buena! ¿qué tal te parece?', 'A|no puedo dejarlo, son las {hora} y sigo', 'C|ya fue, te perdimos', 'B|bienvenido al club']),
('juegos', array['A|torneo del fogón de {juego}, ¿quién se anota?', 'B|yo!', 'C|yo también, pero no me hagan perder rápido', 'A|tranqui, es para pasarla bien', 'B|el que pierde trae las facturas', 'C|ahora sí hay presión']),
-- programación
('programacion', array['A|¿{lenguaje} para arrancar a programar?', 'B|para mí sí, es amigable', 'C|depende de qué quieras hacer', 'A|páginas web más que nada', 'C|entonces JavaScript y después vas viendo', 'B|y mucha paciencia con el CSS 😂']),
('programacion', array['A|estuve 2 horas con un bug y era un punto y coma', 'B|clásico', 'C|el punto y coma es el enemigo silencioso', 'A|me quiero ir a vivir a {lugar} y criar {animal}s', 'B|jajaja todos pasamos por esa etapa']),
('programacion', array['A|tabs o espacios', 'B|espacios, dos', 'C|tabs y que el editor decida', 'A|se pudrió todo', 'B|el formateador automático nos salva a todos', 'C|amén']),
('programacion', array['A|¿qué están programando ahora?', 'B|un bot para el fogón jaja', 'C|una app de recetas para hacer {comida}', 'A|las dos me encantan', 'C|cuando esté lista la comparto', 'B|y yo la pruebo con el bot']),
('programacion', array['A|"funciona en mi máquina" debería ser un meme oficial', 'B|ya lo es', 'C|y la respuesta: "entonces mandamos tu máquina a producción"', 'A|JAJAJA', 'B|eso es Docker resumido']),
('programacion', array['A|hoy aprendí algo nuevo de {lenguaje} y me siento invencible', 'B|disfrutalo, mañana algo no te va a compilar', 'A|siempre arruinando todo {B} 😂', 'C|es la ley del programador', 'B|equilibrio universal']);

-- arma una charla: elige diálogo, gente y huecos, y la encola con tiempos de persona
create or replace function public.fogon_bot_convo_start(p_channel uuid, p_tag text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c record; v_turns text[]; v_bots uuid[]; v_names text[]; v_turn text; v_role text; v_body text; v_bot uuid;
  v_at timestamptz := now(); v_slot text; v_val text; v_try int := 0; v_ok boolean := false; i int;
  slots jsonb := jsonb_build_object(
    'serie', array['The Bear', 'Breaking Bad', 'Dark', 'Stranger Things', 'The Office', 'Succession', 'Los Simuladores', 'El Marginal', 'Merlí', 'La Casa de Papel'],
    'peli', array['Relatos Salvajes', 'Nueve Reinas', 'El secreto de sus ojos', 'Interstellar', 'Matrix', 'Toy Story', 'Argentina, 1985', 'El Clan'],
    'comida', array['asado', 'pizza', 'empanadas', 'milanesa con papas fritas', 'sushi', 'guiso de lentejas', 'choripán', 'ñoquis', 'locro'],
    'juego', array['Minecraft', 'Valorant', 'LoL', 'FIFA', 'Among Us', 'Hollow Knight', 'Stardew Valley', 'CS2', 'Rocket League', 'Fortnite'],
    'banda', array['Soda Stereo', 'Los Redondos', 'Charly García', 'Spinetta', 'Divididos', 'Babasónicos', 'Duki', 'Bizarrap', 'Wos', 'Tan Biónica', 'Los Fabulosos Cadillacs', 'Miranda!'],
    'lenguaje', array['Python', 'JavaScript', 'Rust', 'Go', 'TypeScript', 'Java', 'PHP'],
    'lugar', array['Bariloche', 'Mendoza', 'la costa', 'Córdoba', 'Salta', 'El Chaltén', 'Mar del Plata', 'Ushuaia', 'Iguazú'],
    'hora', array['las 3 de la mañana', 'las 4 de la mañana', 'las 2 de la tarde', 'el mediodía'],
    'animal', array['carpincho', 'gato', 'perro', 'hornero', 'yaguareté', 'pingüino', 'llama']);
begin
  loop
    v_try := v_try + 1;
    exit when v_try > 6;
    -- el diálogo que hace más tiempo que no sale en este canal (o nunca)
    select cv.* into c from public.fogon_bot_convos cv
    where cv.tag = p_tag
    order by (select max(r.started_at) from public.fogon_bot_convo_runs r where r.convo_id = cv.id and r.channel_id = p_channel) asc nulls first, random()
    limit 1;
    if not found then return false; end if;
    v_turns := c.turns;
    -- huecos: el mismo valor en toda la charla
    for v_slot in select jsonb_object_keys(slots) loop
      v_val := (select x from jsonb_array_elements_text(slots->v_slot) x order by random() limit 1);
      for i in 1 .. array_length(v_turns, 1) loop v_turns[i] := replace(v_turns[i], '{' || v_slot || '}', v_val); end loop;
    end loop;
    -- que ninguna línea ya se haya dicho en este canal hace poco
    v_ok := not exists (
      select 1 from (select content from public.fogon_messages where channel_id = p_channel order by created_at desc limit 600) m
      where m.content = any (select substr(t, 3) from unnest(v_turns) t));
    if v_ok then exit; end if;
    -- si salió repetido, lo marco como usado y pruebo otro
    insert into public.fogon_bot_convo_runs (convo_id, channel_id, ends_at) values (c.id, p_channel, now() - interval '1 hour');
  end loop;
  if not v_ok then return false; end if;

  -- los que charlan (según el tema, los que más saben)
  select array_agg(id), array_agg(display_name) into v_bots, v_names from (
    select p.id, p.display_name from public.fogon_profiles p
    where p.is_bot and p.username not in ('guardian', 'mica.cm', 'sofi', 'modmail', 'temazo.dj')
    order by (case p_tag
      when 'juegos' then p.username in ('tincho_gamer', 'santi_futbol', 'juli.memes', 'nacho.dev', 'patooo')
      when 'musica' then p.username in ('ro.musica', 'camii', 'juli.memes', 'lucho.mate')
      when 'programacion' then p.username in ('nacho.dev', 'lucho.mate', 'valeee')
      when 'memes' then p.username in ('juli.memes', 'patooo', 'camii', 'santi_futbol')
      else true end) desc, random()
    limit 3) x;
  if coalesce(array_length(v_bots, 1), 0) < 3 then return false; end if;

  for i in 1 .. array_length(v_turns, 1) loop
    v_role := split_part(v_turns[i], '|', 1);
    v_body := substr(v_turns[i], length(v_role) + 2);
    v_bot := v_bots[case v_role when 'A' then 1 when 'B' then 2 else 3 end];
    v_body := replace(replace(replace(replace(v_body, '{A}', v_names[1]), '{B}', v_names[2]), '{C}', v_names[3]), '\n', chr(10));
    -- tiempo de leer + escribir, como una persona
    v_at := v_at + make_interval(secs => case when i = 1 then 1 else 15 + random() * 55 end + length(v_body) / 6.0);
    insert into public.fogon_bot_queue (channel_id, bot_id, body, typing_at, send_at)
    values (p_channel, v_bot, v_body, v_at - make_interval(secs => least(9, 2 + length(v_body) / 25.0)), v_at);
  end loop;
  insert into public.fogon_bot_convo_runs (convo_id, channel_id, ends_at) values (c.id, p_channel, v_at);
  return true;
end $$;
revoke execute on function public.fogon_bot_convo_start(uuid, text) from public, anon, authenticated;

create or replace function public.fogon_bot_convo_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  quiet boolean := v_hour between 3 and 8;
  ch record; p numeric;
begin
  for ch in select bc.channel_id, bc.tag from public.fogon_bot_channels bc where bc.tag in ('general', 'memes', 'musica', 'juegos', 'programacion') loop
    -- una charla a la vez por canal, y un respiro entre charlas
    if exists (select 1 from public.fogon_bot_convo_runs r where r.channel_id = ch.channel_id and r.ends_at > now() - interval '8 minutes') then continue; end if;
    p := case ch.tag when 'general' then 0.05 else 0.018 end * case when quiet then 0.3 else 1 end;
    if random() < p then perform public.fogon_bot_convo_start(ch.channel_id, ch.tag); end if;
  end loop;
end $$;
revoke execute on function public.fogon_bot_convo_tick() from public, anon, authenticated;
select cron.schedule('fogon-bots-charlan', '* * * * *', 'select public.fogon_bot_convo_tick()');

-- las frases sueltas de antes quedan para muy de vez en cuando (ahora charlan)
do $$
declare def text := pg_get_functiondef('public.fogon_bots_tick'::regproc);
begin
  def := replace(def, 'if random() < (case when quiet then 0.2 else 0.55 end) then', 'if random() < (case when quiet then 0.02 else 0.05 end) then');
  if position('0.05 end) then' in def) = 0 then raise exception 'no pude ajustar fogon_bots_tick'; end if;
  execute def;
end $$;

-- arranca una en #general ya
select public.fogon_bot_convo_start('0a06e7df-d375-5f45-8bbf-802ccfde99b6', 'general');
