-- Bots que te hablan por privado + Mica, la community manager de la Comunidad de Fogón.
-- Todo corre en la base: un trigger encola las respuestas y pg_cron las manda cada 5 segundos
-- (con "escribiendo…" de verdad por Realtime Broadcast).

/* ---------- Mica: la community manager ---------- */

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, theme_top, theme_bottom, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000ca01', 'mica.cm', 'Mica', '#eb459e', 'ella', '💬 Community Manager · escribime si necesitás algo',
   'Community manager de la Comunidad de Fogón 🔥' || chr(10) || 'Doy la bienvenida, organizo eventos y respondo dudas. Si algo no anda, avisame por privado.',
   'online', true, '#eb459e', '#4a1d3b', '#eb459e', '2026-10-22 18:00:00+00')
on conflict (id) do nothing;

insert into public.fogon_roles (id, server_id, name, color, position, hoist, perms, auto_assign) values
  ('7c1d1f00-0000-4000-8000-00000000ca02', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Community Manager', '#eb459e', 4, true, array['manage_messages', 'kick_members', 'mention_everyone'], false)
on conflict (id) do nothing;

insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000ca01', '2026-10-22 18:00:00+00') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000ca01', '7c1d1f00-0000-4000-8000-00000000ca02'),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000ca01', 'cc8fa08b-3b00-5e70-8236-f294b228b80d')
on conflict do nothing;
insert into public.fogon_badges (user_id, badge, granted_by) values ('7c1d1f00-0000-4000-8000-00000000ca01', 'staff', null) on conflict do nothing;

/* ---------- cola de mensajes de bots ---------- */

create table if not exists public.fogon_bot_queue (
  id bigserial primary key,
  channel_id uuid not null references public.fogon_channels(id) on delete cascade,
  bot_id uuid not null references public.fogon_profiles(id) on delete cascade,
  body text not null,
  reply_to uuid references public.fogon_messages(id) on delete set null,
  typing_at timestamptz not null,
  send_at timestamptz not null,
  typed_at timestamptz,
  sent_at timestamptz -- se marca, no se borra
);
create index if not exists fogon_bot_queue_pending on public.fogon_bot_queue (send_at) where sent_at is null;
create index if not exists fogon_bot_queue_send on public.fogon_bot_queue (send_at);
alter table public.fogon_bot_queue enable row level security; -- nadie de afuera la toca

-- quién le habló primero a quién (para no spamear)
create table if not exists public.fogon_bot_dm_log (user_id uuid not null, bot_id uuid not null, at timestamptz not null default now());
create index if not exists fogon_bot_dm_log_user on public.fogon_bot_dm_log (user_id, at desc);
alter table public.fogon_bot_dm_log enable row level security;

/* ---------- frases de charla privada ---------- */

create table if not exists public.fogon_bot_dm_lines (id serial primary key, bot text not null default '*', kind text not null, body text not null);
create table if not exists public.fogon_bot_dm_patterns (id serial primary key, bot text, kind text not null, pattern text not null, prio int not null);
alter table public.fogon_bot_dm_lines enable row level security;
alter table public.fogon_bot_dm_patterns enable row level security;

insert into public.fogon_bot_dm_patterns (bot, kind, pattern, prio) values
  -- ayuda de Mica (gana sobre el saludo: "hola, ¿cómo entro a voz?" -> voz)
  ('mica.cm', 'h_voz', '(canal(es)? de voz|llamada|hablar por voz|\mvc\M|micr[oó]fono|no me escuchan|no escucho)', 0),
  ('mica.cm', 'h_ruido', '(ruido|\meco\M|se escucha mal|supresi|interferencia)', 0),
  ('mica.cm', 'h_reportar', '(report|denunci|acos|spam|me molesta|insult|toxic)', 0),
  ('mica.cm', 'h_bug', '(\mbug|un error|no anda|no funciona|se rompi|se colg|no carga)', 1),
  ('mica.cm', 'h_amigos', '(amig|solicitud)', 2),
  ('mica.cm', 'h_perfil', '(perfil|avatar|\mfoto|banner|estado personalizado|\mbio\M)', 2),
  ('mica.cm', 'h_insignias', '(insignia|badge|medalla)', 2),
  ('mica.cm', 'h_roles', '(\mrol(es)?\M|permis|moderador|\mmod\M|ser admin|staff)', 2),
  ('mica.cm', 'h_invitar', '(invit|\mlink\M|enlace|traer a)', 2),
  ('mica.cm', 'h_servidor', '(crear (un |mi )?servidor|mi propio servidor|servidor nuevo)', 2),
  ('mica.cm', 'h_creador', '(qui[eé]n (te )?(cre[oó]|hizo)|qui[eé]n es el due[nñ]o|due[nñ]o de fog)', 2),
  ('mica.cm', 'h_eventos', '(evento|torneo|juntada|actividad)', 3),
  -- para todos
  (null, 'bot', '(\m(sos|eres|es) (un |una )?(bot|ia|robot|programa)|sos real|sos humano|sos una persona|\mbot\?)', 1),
  (null, 'bye', '(\m(chau|chao|nos vemos|me voy|hasta mañana|hasta luego|buenas noches|me tengo que ir|me voy a dormir)\M)', 5),
  (null, 'thanks', '(\m(gracias|grax|graciass+|thx|mil gracias)\M)', 6),
  (null, 'howareyou', '((c[oó]mo) (and[aá]s|est[aá]s|va|te va|andan)|todo bien\?|qu[eé] tal\?|como estas)', 7),
  (null, 'where', '(de d[oó]nde (sos|eres)|d[oó]nde viv[ií]s)', 8),
  (null, 'what', '(qu[eé] (hac[eé]s|cont[aá]s|onda\?)|en qu[eé] and[aá]s)', 9),
  (null, 'greet', '^\s*(hola+|holis|buenas|hey|ey+|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|qu[eé] onda|wena)', 10),
  (null, 'nice', '(\m(genial|buen[ií]simo|joya|de una|dale|re piola|copado|me encanta|bien\M))', 11),
  (null, 'laugh', '(jaj|jsj|jej|\mxd|😂|🤣)', 12),
  (null, 'question', '\?\s*$', 15);

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  -- genéricas
  ('*', 'greet', 'holaa {n}! todo bien?'),
  ('*', 'greet', 'buenaas 👋 cómo va?'),
  ('*', 'greet', 'hola hola! qué contás?'),
  ('*', 'greet', 'eyy {n} 🙌'),
  ('*', 'greet', 'holis! cómo andás?'),
  ('*', 'howareyou', 'todo tranqui por acá, vos?'),
  ('*', 'howareyou', 'bien bien, medio cansade pero bien jaja. vos cómo estás?'),
  ('*', 'howareyou', 'joya! acá en el fogón como siempre 🔥 y vos?'),
  ('*', 'howareyou', 'bien, con mate en mano 🧉 vos?'),
  ('*', 'what', 'nada, boludeando un rato por acá. vos?'),
  ('*', 'what', 'acá, chusmeando #general jaja. vos qué hacés?'),
  ('*', 'where', 'de Argentina como casi todos acá jaja. vos de dónde sos?'),
  ('*', 'thanks', 'de nada! cualquier cosa escribime 🙌'),
  ('*', 'thanks', 'nada que agradecer 😊'),
  ('*', 'thanks', 'de una, para eso estamos'),
  ('*', 'laugh', 'jajaja posta'),
  ('*', 'laugh', 'JAJAJ me mataste'),
  ('*', 'laugh', 'jsjsjs 😂'),
  ('*', 'laugh', 'jajaja nooo'),
  ('*', 'nice', 'buenísimo!'),
  ('*', 'nice', 'qué bueno 🙌'),
  ('*', 'nice', 'joyaa'),
  ('*', 'bye', 'chau {n}! nos vemos por el fogón 🔥'),
  ('*', 'bye', 'dale, hablamos! 👋'),
  ('*', 'bye', 'nos vemos! que descanses'),
  ('*', 'bot', 'jaja sí, soy un bot de la comunidad 🤖 por eso tengo la etiqueta BOT al lado del nombre. pero igual charlemos!'),
  ('*', 'bot', 'sí, bot 🤖 pero con onda. la gente de verdad la encontrás en #general'),
  ('*', 'question', 'uh, buena pregunta. no sé bien, preguntá en #ayuda-fogón que Mica sabe todo'),
  ('*', 'question', 'mmm ni idea la verdad jaja. vos qué pensás?'),
  ('*', 'question', 'creo que sí, pero no me hagas caso jaja'),
  ('*', 'fallback', 'mirá vos, re interesante'),
  ('*', 'fallback', 'nooo posta? contame más'),
  ('*', 'fallback', 'jaja entiendo, me pasa igual'),
  ('*', 'fallback', 'tal cual'),
  ('*', 'fallback', 'uhh mirá. y vos qué hacés además de andar por acá?'),
  ('*', 'fallback', 'ah re, coincido'),
  ('*', 'fallback', 'qué bueno! te gusta el fogón hasta ahora?'),
  ('*', 'fallback', 'jaja sí. che, pasate por el canal de voz Gaming a la noche que siempre hay gente'),

  -- Lucho
  ('lucho.mate', 'opener', 'holaa {n}! vi que andás por el fogón, de dónde sos? yo de Rosario 🧉'),
  ('lucho.mate', 'opener', 'che {n}, vos programás? estoy buscando gente para un proyecto chiquito'),
  ('lucho.mate', 'opener', 'ey! mate o café? es una pregunta importante jaja'),
  ('lucho.mate', 'where', 'de Rosario 🧉 vos?'),
  ('lucho.mate', 'what', 'peleándome con un CSS que no centra nada jaja. vos?'),
  ('lucho.mate', 'fallback', 'jaja tal cual. yo acá con el mate cebado y un bug que no encuentro'),
  ('lucho.mate', 'fallback', 'uh mirá, nunca lo había pensado así'),
  -- Nacho
  ('nacho.dev', 'opener', 'buenas {n}! vi que te uniste hace poco, bienvenide. si te gusta el backend tenemos #programación 😉'),
  ('nacho.dev', 'opener', 'che, este domingo hago asado. virtualmente estás invitade jaja'),
  ('nacho.dev', 'where', 'zona oeste, Buenos Aires. vos?'),
  ('nacho.dev', 'what', 'acá con el tercer café peleándome con una query de Postgres ☕'),
  ('nacho.dev', 'fallback', 'mirá vos. yo estaría metiendo un índice ahí jaja (deformación profesional)'),
  ('nacho.dev', 'fallback', 'tal cual, coincido 100%'),
  -- Flor
  ('flor.dibuja', 'opener', 'holiii {n} 🎨 te puedo hacer una pregunta random? cuál es tu animal favorito? estoy juntando ideas para stickers'),
  ('flor.dibuja', 'opener', 'hola! vi tu perfil, qué lindo color elegiste ✨'),
  ('flor.dibuja', 'where', 'de Córdoba! vos?'),
  ('flor.dibuja', 'what', 'dibujando un carpincho con lentes jaja. vos?'),
  ('flor.dibuja', 'fallback', 'aww me encanta. si querés te dibujo algo de eso 🎨'),
  ('flor.dibuja', 'fallback', 'jaja qué lindo, lo anoto para un sticker'),
  -- Santi
  ('santi_futbol', 'opener', 'buenas {n}! de qué cuadro sos? es para saber si podemos ser amigos jaja ⚽'),
  ('santi_futbol', 'opener', 'che, jugás al fútbol? el jueves nos falta uno para el 5'),
  ('santi_futbol', 'where', 'La Plata, pincha de alma ⚽ vos?'),
  ('santi_futbol', 'what', 'viendo resúmenes de la fecha jaja. vos?'),
  ('santi_futbol', 'fallback', 'jaja vamos que se puede'),
  ('santi_futbol', 'fallback', 'tal cual, como cuando atajo un penal (nunca pasó)'),
  -- Ro
  ('ro.musica', 'opener', 'holaa {n}! qué estás escuchando ahora? necesito recomendaciones 🎸'),
  ('ro.musica', 'opener', 'ey! tocás algún instrumento? estamos armando una zapada en el canal de voz'),
  ('ro.musica', 'where', 'Mendoza, tierra del vino y del rock 🎸 y vos?'),
  ('ro.musica', 'what', 'afinando la viola para el ensayo de mañana. vos?'),
  ('ro.musica', 'fallback', 'uh qué temazo eso jaja'),
  ('ro.musica', 'fallback', 'jaja me encanta. pasalo por #música así lo escuchamos todos'),
  -- Tincho
  ('tincho_gamer', 'opener', 'buenas {n}! jugás algo? siempre nos falta gente para rankear 🎮'),
  ('tincho_gamer', 'opener', 'ey, a la noche hacemos partidas en el canal de voz Gaming, te sumás?'),
  ('tincho_gamer', 'where', 'Mar del Plata, aunque vivo adentro de la compu jaja'),
  ('tincho_gamer', 'what', 'perdiendo una ranked por culpa del jungla, como siempre'),
  ('tincho_gamer', 'fallback', 'jajaja gg'),
  ('tincho_gamer', 'fallback', 'posta. bueno, si querés jugar avisame'),
  -- Vale
  ('valeee', 'opener', 'holaa {n}! estudiás algo? yo estoy con finales y necesito distraerme 5 min jaja'),
  ('valeee', 'opener', 'hola! vi que entraste hace poco, bienvenide 💜'),
  ('valeee', 'where', 'Tucumán! estudio sistemas en la UTN. vos?'),
  ('valeee', 'what', 'rindiendo… o eso intento jaja. vos?'),
  ('valeee', 'fallback', 'jaja re. bueno, vuelvo a estudiar un rato 📚'),
  ('valeee', 'fallback', 'mirá vos! qué bueno'),
  -- Juli
  ('juli.memes', 'opener', 'holaa {n} te comparto un meme? no, mentira, primero decime: perros o gatos?'),
  ('juli.memes', 'opener', 'ey! pasate por #memes que hoy está fuerte jaja'),
  ('juli.memes', 'where', 'Capital, Almagro. vos?'),
  ('juli.memes', 'what', 'scrolleando memes, mi trabajo de tiempo completo 😂'),
  ('juli.memes', 'fallback', 'JAJAJA esto es material para #memes'),
  ('juli.memes', 'fallback', 'nooo jaja, estoy llorando'),
  -- Abu Coco
  ('abucoco', 'opener', 'Hola {n}, ¿cómo le va? Mi nieto me dijo que acá se conoce gente. Yo estoy regando las plantas.'),
  ('abucoco', 'opener', 'Buenas tardes, {n}. ¿Usted sabe cómo se pone una foto en el perfil? Mi nieto no me contesta.'),
  ('abucoco', 'greet', 'Hola querido/a, ¿cómo anda? Qué lindo que me escriba.'),
  ('abucoco', 'where', 'De Chivilcoy, de toda la vida. ¿Y usted?'),
  ('abucoco', 'what', 'Acá, tomando unos mates y mirando por la ventana. ¿Usted?'),
  ('abucoco', 'laugh', 'Jajaja, qué ocurrente que es usted.'),
  ('abucoco', 'fallback', 'Ah, mire usted. En mi época eso no existía.'),
  ('abucoco', 'fallback', 'Qué interesante. Se lo voy a contar a mi nieto.'),
  ('abucoco', 'bye', 'Bueno, querido/a, que tenga lindo día. Cuídese.'),
  -- Pato
  ('patooo', 'opener', 'ey {n}, vos también estás despierte a esta hora? jaja'),
  ('patooo', 'opener', 'buenas! che, recomendame una serie que ya vi todo netflix'),
  ('patooo', 'where', 'Neuquén, donde de noche hace un frío terrible'),
  ('patooo', 'what', 'nada, otra vez sin dormir jaja. vos?'),
  ('patooo', 'fallback', 'jaja re. yo ya debería estar durmiendo igual'),
  ('patooo', 'fallback', 'mirá vos. bueno, ahora no me duermo más pensando en eso'),
  -- Cami
  ('camii', 'opener', 'holaa {n}! Soda o Redondos? pensalo bien 🎧'),
  ('camii', 'opener', 'ey! te vi por #general, sos nueve no? bienvenide 💃'),
  ('camii', 'where', 'Salta la linda 💃 vos?'),
  ('camii', 'what', 'escuchando Soda en loop, como siempre jaja'),
  ('camii', 'fallback', 'jaja amo. bueno, te paso un tema después'),
  ('camii', 'fallback', 'tal cual! coincidimos en todo'),

  -- Mica, la community manager
  ('mica.cm', 'welcome', '¡Hola {n}! 👋 Soy Mica, la community manager de la Comunidad de Fogón.' || chr(10) || chr(10) || 'Algunas cositas para arrancar:' || chr(10) || '• Leé #bienvenida (son 4 reglas, nada más)' || chr(10) || '• Presentate en #general, la gente es re buena onda' || chr(10) || '• A la noche siempre hay alguien en los canales de voz 🔊' || chr(10) || '• Si tenés dudas, preguntá en #ayuda-fogón o escribime acá' || chr(10) || chr(10) || '¡Bienvenide! 🔥'),
  ('mica.cm', 'greet', '¡Hola {n}! 😊 ¿En qué te puedo ayudar?'),
  ('mica.cm', 'greet', '¡Buenas! Acá Mica 💬 Contame, ¿qué necesitás?'),
  ('mica.cm', 'howareyou', '¡Muy bien, gracias! Organizando el próximo evento de la comunidad 🎉 ¿Vos cómo venís? ¿Te está gustando Fogón?'),
  ('mica.cm', 'what', 'Acá, moderando un poco y preparando el anuncio de la semana 📣 ¿Necesitás algo?'),
  ('mica.cm', 'where', 'Vivo en los servidores de Fogón jaja ☁️ ¿Vos de dónde sos?'),
  ('mica.cm', 'thanks', '¡De nada! Para eso estoy 💜 Cualquier cosa me escribís.'),
  ('mica.cm', 'thanks', '¡A vos! Que disfrutes la comunidad 🔥'),
  ('mica.cm', 'nice', '¡Me alegra un montón! 🙌'),
  ('mica.cm', 'laugh', 'jajaja 😂'),
  ('mica.cm', 'bye', '¡Chau {n}! Cualquier cosa acá estoy 👋'),
  ('mica.cm', 'bot', 'Sí, soy un bot 🤖 (por eso la etiqueta BOT al lado del nombre). Igual te puedo ayudar con casi todo lo de Fogón: preguntame.'),
  ('mica.cm', 'question', 'Mmm, esa no la sé 🤔 Probá preguntarla en #ayuda-fogón que alguien seguro sabe. Yo te puedo ayudar con: canales de voz, ruido en el micrófono, amigos, perfil, insignias, roles, invitaciones o reportar a alguien.'),
  ('mica.cm', 'fallback', '¡Anotado! 📝 Si necesitás ayuda con algo de Fogón (voz, amigos, perfil, roles, invitaciones…) preguntame lo que quieras.'),
  ('mica.cm', 'fallback', '¡Qué bueno! 😊 Si querés conocer gente, pasate por #general o los canales de voz a la noche.'),
  ('mica.cm', 'h_voz', 'Para hablar por voz: tocá cualquier canal con 🔊 (están en CANALES DE VOZ) y entrás directo. Abajo a la izquierda tenés micrófono, auriculares y el botón rojo para cortar 🎧' || chr(10) || 'La primera vez el navegador te pide permiso para el micrófono: dale «Permitir».'),
  ('mica.cm', 'h_ruido', 'Para que no se escuche ruido: engranaje ⚙️ → Voz → dejá la supresión en «IA (RNNoise)» y probá con «Probemos». En plena llamada también está el botón con las barritas 〰️. Si hay eco, usá auriculares 🎧'),
  ('mica.cm', 'h_amigos', 'Para agregar amigos: tocá el fogón 🔥 arriba a la izquierda → Amigos → «Añadir amigo» y escribí su @usuario. Las solicitudes que te llegan están en «Pendiente».'),
  ('mica.cm', 'h_perfil', 'Tu perfil se edita en el engranaje ⚙️ → Perfiles: foto, banner, colores del tema, bio, pronombres y estado personalizado. A la derecha ves cómo queda en vivo ✨'),
  ('mica.cm', 'h_insignias', 'Las insignias las da el staff a mano (Fundador, Cazabugs, Artista, VIP…). La de Pionero/a es automática para los que llegaron primero 🔥 Si encontrás un bug y lo reportás, podés ganarte la de Cazabugs 😉'),
  ('mica.cm', 'h_roles', 'Al entrar te toca Fogoneros 🔥 Moderación y Community Manager los da la administración a gente activa y buena onda. ¡Participá y quién te dice!'),
  ('mica.cm', 'h_invitar', 'Para invitar gente: tocá el nombre del servidor arriba a la izquierda → «Invitar gente» y copiás el link. Para esta comunidad el código es «comunidad» 🙌'),
  ('mica.cm', 'h_servidor', 'Tocá el + verde de la barra izquierda → «Crear servidor». Es tuyo: canales, categorías, roles y permisos como quieras 🙌'),
  ('mica.cm', 'h_creador', 'Fogón lo hizo @gonza 🔥 Yo soy Mica, la community manager: cuido que la comunidad esté linda y respondo dudas.'),
  ('mica.cm', 'h_eventos', 'Hacemos juntadas en los canales de voz casi todas las noches 🎮🎸 y los anuncios salen en #anuncios. ¿Te gustaría proponer alguna actividad? ¡Contame!'),
  ('mica.cm', 'h_reportar', 'Gracias por avisar 🙏 Pasame el @ de la persona y qué pasó, y lo veo con Moderación. Mientras tanto, desde su perfil podés bloquearla y no te va a poder escribir.'),
  ('mica.cm', 'h_bug', 'Uh, gracias por avisar 🐛 ¿Me contás qué estabas haciendo y desde qué navegador? Lo paso al equipo, y si se confirma te ganás la insignia de Cazabugs 😎');

-- Mica en los canales
insert into public.fogon_bot_lines (tag, body) values
  ('cm_bienvenida', '¡Bienvenide {u} a la Comunidad de Fogón! 🔥 Pasá por #bienvenida y contanos de dónde sos 👋'),
  ('cm_bienvenida', '¡Llegó {u}! 🎉 Bienvenide al fogón. Cualquier duda, #ayuda-fogón o mandame un privado 💬'),
  ('cm_bienvenida', 'Démosle la bienvenida a {u} 🙌 ¡Ponete cómode, hay mate para todos! 🧉'),
  ('cm_anuncio', '📣 **Noche de juegos** — Hoy desde las 22 h en el canal de voz Gaming 🎮 ¡Traigan ganas (y auriculares)!'),
  ('cm_anuncio', '📣 Ya pueden usar la **supresión de ruido con IA** en los canales de voz: engranaje → Voz. ¡Chau ventilador! 〰️'),
  ('cm_anuncio', '📣 **Zapada abierta** el viernes en el canal de voz Fogón 🎸 Ro pone la viola, ustedes las ganas.'),
  ('cm_anuncio', '📣 Recordatorio: si encuentran un bug, avísenme por privado. Los que lo reporten primero se llevan la insignia **Cazabugs** 🐛'),
  ('cm_anuncio', '📣 **Concurso de stickers**: Flor va a dibujar la mascota de la comunidad. Dejen sus ideas en #general 🎨'),
  ('cm_anuncio', '📣 Nuevo: ya pueden **agregar amigos** y ver quién está activo ahora. ¡Hagan amigos en el fogón! 🔥'),
  ('cm_general', '¿Qué están escuchando hoy? 🎧 Dejen el tema y armamos una playlist de la comunidad'),
  ('cm_general', 'Pregunta del día ☀️: ¿mate dulce o amargo? (se aceptan peleas sanas)'),
  ('cm_general', 'Hola gente 👋 ¿cómo viene el día? Recuerden que a la noche hay gente en los canales de voz 🔊'),
  ('cm_general', 'Encuesta rápida 📊: ¿qué evento quieren para el finde? 🎮 juegos / 🎸 zapada / 🎬 peli'),
  ('cm_general', 'Si alguien es nuevo y no se presentó todavía, ¡es su momento! 😄 ¿De dónde son?'),
  ('cm_general', 'Gracias a todos por hacer de esto un lugar tan lindo 💜🔥');

/* ---------- funciones ---------- */

-- clasifica lo que te escribieron
create or replace function public.fogon_bot_kind(p_content text, p_bot text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select kind from public.fogon_bot_dm_patterns
    where (bot is null or bot = p_bot) and p_content ~* pattern
    order by prio, (bot is null) limit 1
  ), 'fallback');
$$;

-- elige una frase del bot (prefiere las suyas) que no haya dicho hace poco en ese canal
create or replace function public.fogon_bot_line(p_bot uuid, p_kind text, p_user uuid, p_channel uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_bot text; v_name text; v_user text; v_body text;
begin
  select username into v_bot from public.fogon_profiles where id = p_bot;
  select display_name, username into v_name, v_user from public.fogon_profiles where id = p_user;
  select l.body into v_body from public.fogon_bot_dm_lines l
  where l.kind = p_kind and (l.bot = v_bot or (l.bot = '*' and v_bot <> 'mica.cm'))
    and not exists (
      select 1 from (select content from public.fogon_messages where channel_id = p_channel and author_id = p_bot order by created_at desc limit 12) r
      where r.content = replace(replace(l.body, '{n}', coalesce(v_name, '')), '{u}', '@' || coalesce(v_user, '')))
  order by random() * (case when l.bot = v_bot then 1 else 2.5 end) limit 1;
  if v_body is null and p_kind <> 'fallback' then return public.fogon_bot_line(p_bot, 'fallback', p_user, p_channel); end if;
  if v_body is null then
    select l.body into v_body from public.fogon_bot_dm_lines l where l.kind = 'fallback' and (l.bot = v_bot or (l.bot = '*' and v_bot <> 'mica.cm')) order by random() limit 1;
  end if;
  return replace(replace(v_body, '{n}', coalesce(v_name, '')), '{u}', '@' || coalesce(v_user, ''));
end $$;

-- encola un mensaje con "escribiendo…" antes, a velocidad de persona
create or replace function public.fogon_bot_enqueue(p_channel uuid, p_bot uuid, p_body text, p_reply uuid, p_wait interval)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_type interval := make_interval(secs => least(9, 1.2 + length(p_body) / 28.0) + random() * 1.5);
begin
  insert into public.fogon_bot_queue (channel_id, bot_id, body, reply_to, typing_at, send_at)
  values (p_channel, p_bot, p_body, p_reply, now() + p_wait, now() + p_wait + v_type);
end $$;

-- abre (o encuentra) el privado entre un bot y una persona
create or replace function public.fogon_bot_dm_channel(p_bot uuid, p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if public.fogon_is_blocked_between(p_bot, p_user) then return null; end if;
  select a.channel_id into cid from public.fogon_dm_participants a
  join public.fogon_dm_participants b on b.channel_id = a.channel_id
  where a.user_id = p_bot and b.user_id = p_user limit 1;
  if cid is null then
    insert into public.fogon_channels (kind) values ('dm') returning id into cid;
    insert into public.fogon_dm_participants (channel_id, user_id) values (cid, p_bot), (cid, p_user);
  end if;
  return cid;
end $$;

-- un bot le escribe primero a alguien
create or replace function public.fogon_bot_open_dm(p_bot uuid, p_user uuid, p_kind text, p_wait interval)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  cid := public.fogon_bot_dm_channel(p_bot, p_user);
  if cid is null then return; end if;
  perform public.fogon_bot_enqueue(cid, p_bot, public.fogon_bot_line(p_bot, p_kind, p_user, cid), null, p_wait);
  insert into public.fogon_bot_dm_log (user_id, bot_id) values (p_user, p_bot);
end $$;

-- alguien nuevo en la comunidad: Mica saluda en #general, le escribe por privado, y después otro bot
create or replace function public.fogon_community_welcome()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  v_user text; v_body text; other uuid;
begin
  if new.server_id <> 'e56307db-6dfc-5a65-88a3-486d38ec17c2' then return new; end if;
  if exists (select 1 from public.fogon_profiles where id = new.user_id and is_bot) then return new; end if;
  select username into v_user from public.fogon_profiles where id = new.user_id;
  select replace(body, '{u}', '@' || v_user) into v_body from public.fogon_bot_lines where tag = 'cm_bienvenida' order by random() limit 1;
  perform public.fogon_bot_enqueue('0a06e7df-d375-5f45-8bbf-802ccfde99b6', mica, v_body, null, make_interval(secs => 6 + random() * 6));
  if not exists (select 1 from public.fogon_bot_dm_log where user_id = new.user_id and bot_id = mica) then
    perform public.fogon_bot_open_dm(mica, new.user_id, 'welcome', make_interval(secs => 25 + random() * 10));
  end if;
  select id into other from public.fogon_profiles
  where is_bot and username not in ('guardian', 'mica.cm')
    and not exists (select 1 from public.fogon_bot_dm_log l where l.user_id = new.user_id and l.bot_id = id)
  order by random() limit 1;
  if other is not null then
    perform public.fogon_bot_open_dm(other, new.user_id, 'opener', make_interval(secs => 120 + random() * 240));
  end if;
  return new;
end $$;
create or replace trigger fogon_community_welcome after insert on public.fogon_members for each row execute function public.fogon_community_welcome();

-- respuestas casi al toque: privados con bots, menciones a bots y #ayuda-fogón (las contesta Mica)
create or replace function public.fogon_bot_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  ch public.fogon_channels; bot uuid; v_bot text; v_kind text; v_body text; v_status text; v_wait interval; v_tag text;
begin
  if exists (select 1 from public.fogon_profiles where id = new.author_id and is_bot) then return null; end if;
  select * into ch from public.fogon_channels where id = new.channel_id;

  if ch.kind = 'dm' then
    select p.id, p.username, p.status into bot, v_bot, v_status
    from public.fogon_dm_participants d join public.fogon_profiles p on p.id = d.user_id and p.is_bot
    where d.channel_id = new.channel_id limit 1;
    if bot is null then return null; end if;
    v_kind := public.fogon_bot_kind(new.content, v_bot);
    v_body := public.fogon_bot_line(bot, v_kind, new.author_id, new.channel_id);
    -- si mandás varios seguidos, contesta una sola vez (al último)
    update public.fogon_bot_queue set body = v_body, typing_at = now() + interval '2 seconds', send_at = now() + interval '5 seconds'
    where channel_id = new.channel_id and sent_at is null and typed_at is null;
    if found then return null; end if;
    v_wait := make_interval(secs => case when v_bot = 'mica.cm' then 1.5 + random() * 2
                                         when v_status in ('idle', 'dnd') then 8 + random() * 20
                                         else 2 + random() * 5 end);
    perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, null, v_wait);
    return null;
  end if;

  if ch.server_id <> 'e56307db-6dfc-5a65-88a3-486d38ec17c2' then return null; end if;
  select tag into v_tag from public.fogon_bot_channels where channel_id = new.channel_id;

  if mica = any(new.mentions) or v_tag = 'ayuda' then
    bot := mica;
    v_kind := public.fogon_bot_kind(new.content, 'mica.cm');
    if v_kind in ('fallback', 'nice', 'laugh') and v_tag = 'ayuda' and not (mica = any(new.mentions)) then
      v_kind := 'question';
    end if;
    v_body := public.fogon_bot_line(bot, v_kind, new.author_id, new.channel_id);
  else
    select id into bot from public.fogon_profiles where is_bot and id = any(new.mentions) and username <> 'guardian' order by random() limit 1;
    if bot is null then return null; end if;
    select bodies[1 + floor(random() * array_length(bodies, 1))::int] into v_body
    from public.fogon_bot_replies where new.content ~ pattern order by prio limit 1;
    select replace(v_body, '{u}', '@' || username) into v_body from public.fogon_profiles where id = new.author_id;
  end if;
  if v_body is null then return null; end if;
  insert into public.fogon_bot_replied (message_id) values (new.id) on conflict do nothing; -- que el tick no conteste otra vez
  perform public.fogon_bot_enqueue(new.channel_id, bot, v_body, new.id, make_interval(secs => 3 + random() * 6));
  return null;
end $$;
create or replace trigger fogon_bot_on_message after insert on public.fogon_messages for each row execute function public.fogon_bot_on_message();

-- cada 5 s: avisa "escribiendo…" y manda lo que ya está listo
create or replace function public.fogon_bots_fast()
returns void language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  for q in select * from public.fogon_bot_queue where sent_at is null and typing_at <= now() and send_at > now() and (typed_at is null or typed_at < now() - interval '4 seconds') loop
    begin
      perform realtime.send(jsonb_build_object('user_id', q.bot_id), 'typing', 'typing:' || q.channel_id, false);
    exception when others then null;
    end;
    update public.fogon_bot_queue set typed_at = now() where id = q.id;
  end loop;

  for q in select * from public.fogon_bot_queue where sent_at is null and send_at <= now() and send_at > now() - interval '10 minutes' order by send_at limit 30 loop
    update public.fogon_bot_queue set sent_at = now() where id = q.id;
    begin
      insert into public.fogon_messages (channel_id, author_id, content, reply_to_id) values (q.channel_id, q.bot_id, q.body, q.reply_to);
      perform realtime.send(jsonb_build_object('user_id', q.bot_id, 'stop', true), 'typing', 'typing:' || q.channel_id, false);
    exception when others then null; -- te bloqueó, se borró el canal, etc.
    end;
  end loop;
end $$;

revoke execute on function public.fogon_bot_kind(text, text) from public, anon, authenticated;
revoke execute on function public.fogon_bot_line(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fogon_bot_enqueue(uuid, uuid, text, uuid, interval) from public, anon, authenticated;
revoke execute on function public.fogon_bot_dm_channel(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fogon_bot_open_dm(uuid, uuid, text, interval) from public, anon, authenticated;
revoke execute on function public.fogon_community_welcome() from public, anon, authenticated;
revoke execute on function public.fogon_bot_on_message() from public, anon, authenticated;
revoke execute on function public.fogon_bots_fast() from public, anon, authenticated;

select cron.schedule('fogon-bots-fast', '5 seconds', 'select public.fogon_bots_fast()');

/* ---------- el tick de cada minuto: Mica publica, y los bots a veces te escriben primero ---------- */

create or replace function public.fogon_bots_social()
returns void language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  awake boolean := v_hour between 10 and 23;
  v_body text; who uuid; bot uuid;
begin
  -- Mica: más o menos un anuncio por día y un par de mensajes en #general
  if v_hour between 12 and 21 and random() < 0.0016 then
    select l.body into v_body from public.fogon_bot_lines l where l.tag = 'cm_anuncio'
      and not exists (select 1 from (select content from public.fogon_messages where channel_id = '9b58a035-f39d-5f53-8822-696ae155f652' order by created_at desc limit 5) r where r.content = l.body)
    order by random() limit 1;
    if v_body is not null then perform public.fogon_bot_enqueue('9b58a035-f39d-5f53-8822-696ae155f652', mica, v_body, null, interval '1 second'); end if;
  end if;
  if awake and random() < 0.004 then
    select l.body into v_body from public.fogon_bot_lines l where l.tag = 'cm_general'
      and not exists (select 1 from (select content from public.fogon_messages where channel_id = '0a06e7df-d375-5f45-8bbf-802ccfde99b6' order by created_at desc limit 60) r where r.content = l.body)
    order by random() limit 1;
    if v_body is not null then perform public.fogon_bot_enqueue('0a06e7df-d375-5f45-8bbf-802ccfde99b6', mica, v_body, null, interval '1 second'); end if;
  end if;
  update public.fogon_profiles set status = case when awake then 'online' else 'idle' end
  where id = mica and status is distinct from case when awake then 'online' else 'idle' end;

  -- de vez en cuando un bot le escribe primero a alguien activo (máximo uno por persona cada 20 h)
  if awake and random() < 0.03 then
    select p.id into who from public.fogon_profiles p
    join public.fogon_members m on m.user_id = p.id and m.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
    where not p.is_bot
      and (exists (select 1 from public.fogon_messages x where x.author_id = p.id and x.created_at > now() - interval '3 days') or m.joined_at > now() - interval '3 days')
      and not exists (select 1 from public.fogon_bot_dm_log l where l.user_id = p.id and l.at > now() - interval '20 hours')
    order by random() limit 1;
    if who is not null then
      select b.id into bot from public.fogon_profiles b
      where b.is_bot and b.username not in ('guardian', 'mica.cm')
      order by (exists (select 1 from public.fogon_bot_dm_log l where l.user_id = who and l.bot_id = b.id)), random() limit 1;
      perform public.fogon_bot_open_dm(bot, who, 'opener', interval '1 second');
    end if;
  end if;
end $$;
revoke execute on function public.fogon_bots_social() from public, anon, authenticated;
select cron.schedule('fogon-bots-social', '* * * * *', 'select public.fogon_bots_social()');

-- el tick de siempre (charla en canales) no usa a Mica: ella tiene su propia agenda
do $$
declare def text := pg_get_functiondef('public.fogon_bots_tick'::regproc);
begin
  execute replace(def, 'username <> ''guardian''', 'username not in (''guardian'', ''mica.cm'')');
end $$;

/* ---------- los que ya están en la comunidad también reciben la bienvenida de Mica y un privado ---------- */

do $$
declare u record; i int := 0; other uuid;
begin
  for u in
    select m.user_id from public.fogon_members m join public.fogon_profiles p on p.id = m.user_id and not p.is_bot
    where m.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
  loop
    perform public.fogon_bot_open_dm('7c1d1f00-0000-4000-8000-00000000ca01', u.user_id, 'welcome', make_interval(secs => 10 + i * 4));
    select id into other from public.fogon_profiles where is_bot and username not in ('guardian', 'mica.cm') order by random() limit 1;
    perform public.fogon_bot_open_dm(other, u.user_id, 'opener', make_interval(secs => 60 + i * 15 + random() * 60));
    i := i + 1;
  end loop;
end $$;
