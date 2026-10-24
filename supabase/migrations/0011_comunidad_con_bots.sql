create extension if not exists pg_cron;
-- Comunidad de Fogón: servidor público con miembros bot (marcados como BOT) que charlan solos.
-- Corre con pg_cron cada minuto. Todo lo que publican sale de las frases de abajo.
insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, created_at) values
  ('2ed2b589-38e6-51aa-b655-4366622bdd3a', 'lucho.mate', 'Lucho', '#4f9d69', 'él', '🧉 mate y código', 'Dev frontend en Rosario. Si algo se rompe, fue el CSS.', 'online', true, now() - interval '20 days'),
  ('2164d4a2-2c40-572f-85bf-3d0c72f5415f', 'camii', 'Cami', '#c4569b', 'ella', '🎧 Soda Stereo en loop', 'Escucho de todo menos reguetón (mentira, también).', 'online', true, now() - interval '19 days'),
  ('af7bb57e-817c-50c0-b9cf-80be9e57303f', 'tincho_gamer', 'Tincho', '#3f7fd1', 'él', '🎮 rankeando', 'Main support. Si perdemos es culpa del jungla.', 'idle', true, now() - interval '18 days'),
  ('e411cf51-2596-55f1-baa2-04830f508fa4', 'flor.dibuja', 'Flor', '#d4a72c', 'ella', '✏️ dibujando', 'Ilustradora. Hago stickers de carpinchos.', 'online', true, now() - interval '17 days'),
  ('838ca1a6-a8ed-5d54-9b6a-71a151f5bc48', 'nacho.dev', 'Nacho', '#2f9c95', 'él', '☕ tercer café', 'Backend, Postgres y asado los domingos.', 'dnd', true, now() - interval '16 days'),
  ('f5d54ab5-c36f-5041-8d34-05d4f9d5c4a1', 'valeee', 'Vale', '#7a63d6', 'ella', '📚 rindiendo final', 'Estudiante de sistemas. Pidan apuntes.', 'idle', true, now() - interval '15 days'),
  ('009e2326-87a4-5598-b3a3-f7b7fba67666', 'santi_futbol', 'Santi', '#d0504a', 'él', '⚽ vamos que se puede', 'Fútbol 5 los jueves. Arquero suplente.', 'online', true, now() - interval '14 days'),
  ('c120abb4-bf0b-58dd-9c75-93f04a3854ee', 'juli.memes', 'Juli', '#e07a3f', 'elle', '😂 coleccionando memes', 'Curador oficial de #memes.', 'online', true, now() - interval '13 days'),
  ('5b562d7b-f31b-5b40-b5f1-d36a0d8d1d2a', 'guardian', 'Guardián del Fogón', '#5865f2', '', '🛡️ cuidando el fogón', 'Bot de moderación. Leé #bienvenida antes de escribir.', 'online', true, now() - interval '12 days'),
  ('9cec17fc-90de-5c5d-8392-595ac9a3c314', 'abucoco', 'Abu Coco', '#6b7b77', 'él', '🌿 regando las plantas', 'Tengo 74 años y mi nieto me enseñó a usar esto.', 'idle', true, now() - interval '11 days'),
  ('e89d0e5d-909f-5af5-a254-6d828c8a4115', 'ro.musica', 'Ro', '#c4569b', 'ella', '🎸 tocando la viola', 'Toco en una banda de rock barrial.', 'online', true, now() - interval '10 days'),
  ('53408008-c776-5076-9d42-d4ba340ffd71', 'patooo', 'Pato', '#4f9d69', 'él', '🌙 durmiendo… o eso dicen', 'Insomne profesional.', 'idle', true, now() - interval '9 days')
on conflict (id) do nothing;
insert into public.fogon_servers (id, name, owner_id, invite_code) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Comunidad de Fogón', 'e7809edc-8559-4df6-8d2b-1fffc7a27719', 'comunidad') on conflict (id) do nothing;
insert into public.fogon_members (server_id, user_id, joined_at) select 'e56307db-6dfc-5a65-88a3-486d38ec17c2', p.id, coalesce(p.created_at, now()) from public.fogon_profiles p on conflict do nothing;
create table if not exists public.fogon_bot_channels (channel_id uuid primary key references public.fogon_channels(id) on delete cascade, tag text not null);
insert into public.fogon_channels (id, server_id, kind, name, position) values ('3b618bd2-8f0b-5bb8-b1ca-2d32d1aa57b5', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'category', 'BIENVENIDA', 0) on conflict (id) do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('ee962bfd-d9e5-5682-b3e9-7cb4ea3c354e', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'bienvenida', 'Leé esto antes de escribir 🔥', '3b618bd2-8f0b-5bb8-b1ca-2d32d1aa57b5', 0) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('ee962bfd-d9e5-5682-b3e9-7cb4ea3c354e', 'reglas') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('9b58a035-f39d-5f53-8822-696ae155f652', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'anuncios', 'Novedades de Fogón', '3b618bd2-8f0b-5bb8-b1ca-2d32d1aa57b5', 1) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('9b58a035-f39d-5f53-8822-696ae155f652', 'anuncios') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, position) values ('3a33db97-61b8-5516-b5c3-106a35194799', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'category', 'CHARLA', 1) on conflict (id) do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('0a06e7df-d375-5f45-8bbf-802ccfde99b6', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'general', 'Para charlar de todo', '3a33db97-61b8-5516-b5c3-106a35194799', 0) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('0a06e7df-d375-5f45-8bbf-802ccfde99b6', 'general') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('a29f8934-d55d-5eea-bb0b-602e17d616a2', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'memes', 'Solo memes de calidad (o no)', '3a33db97-61b8-5516-b5c3-106a35194799', 1) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('a29f8934-d55d-5eea-bb0b-602e17d616a2', 'memes') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('56a306e2-5906-5cf0-ab03-da9af6a13468', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'música', 'Qué estás escuchando', '3a33db97-61b8-5516-b5c3-106a35194799', 2) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('56a306e2-5906-5cf0-ab03-da9af6a13468', 'musica') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('f7119590-184d-5295-a2a5-b9cb8c7d7305', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'juegos', 'Partidas, rankeds y quejas', '3a33db97-61b8-5516-b5c3-106a35194799', 3) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('f7119590-184d-5295-a2a5-b9cb8c7d7305', 'juegos') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('362d4866-c094-53af-a6c1-7165bb03db3a', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'programación', 'Mate y código', '3a33db97-61b8-5516-b5c3-106a35194799', 4) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('362d4866-c094-53af-a6c1-7165bb03db3a', 'programacion') on conflict do nothing;
insert into public.fogon_channels (id, server_id, kind, name, position) values ('53ff670a-b4dd-52f1-b7a8-ccb7272f94a5', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'category', 'AYUDA', 2) on conflict (id) do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values ('da756543-f5b0-55bb-b074-b078908fd2cb', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'ayuda-fogón', 'Preguntá lo que quieras de Fogón', '53ff670a-b4dd-52f1-b7a8-ccb7272f94a5', 0) on conflict (id) do nothing;
insert into public.fogon_bot_channels values ('da756543-f5b0-55bb-b074-b078908fd2cb', 'ayuda') on conflict do nothing;
insert into public.fogon_channel_overrides (server_id, channel_id, role_id, deny) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '3b618bd2-8f0b-5bb8-b1ca-2d32d1aa57b5', null, '{send_messages}') on conflict do nothing;
insert into public.fogon_roles (id, server_id, name, color, position, hoist, perms, auto_assign) values ('cd2a1041-5663-5e79-a94f-e6fd2978b54b', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Moderación', '#f2a531', 3, true, '{manage_messages,kick_members}', false), ('cc8fa08b-3b00-5e70-8236-f294b228b80d', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Bots', '#5865f2', 2, true, '{}', false), ('948e497c-1084-5550-8bbb-59dd3a7e7fb1', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Fogoneros', '#4f9d69', 1, false, '{}', true) on conflict (id) do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) select 'e56307db-6dfc-5a65-88a3-486d38ec17c2', p.id, 'cc8fa08b-3b00-5e70-8236-f294b228b80d' from public.fogon_profiles p where p.is_bot on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '5b562d7b-f31b-5b40-b5f1-d36a0d8d1d2a', 'cd2a1041-5663-5e79-a94f-e6fd2978b54b') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) select 'e56307db-6dfc-5a65-88a3-486d38ec17c2', p.id, '948e497c-1084-5550-8bbb-59dd3a7e7fb1' from public.fogon_profiles p where not p.is_bot on conflict do nothing;
create table if not exists public.fogon_bot_lines (id serial primary key, tag text not null, body text not null);
create table if not exists public.fogon_bot_replies (id serial primary key, pattern text not null, bodies text[] not null, prio int not null);
create table if not exists public.fogon_bot_replied (message_id uuid primary key references public.fogon_messages(id) on delete cascade, at timestamptz not null default now());
insert into public.fogon_bot_lines (tag, body) values ('general', 'buenas buenas, ¿cómo va el sábado?'), ('general', 'alguien más con sueño hoy o soy yo'), ('general', 'che qué frío que hace, se vino el invierno de golpe'), ('general', 'hoy hay asado en casa, ya tengo el fuego prendido 🔥'), ('general', '¿alguien vio el partido de anoche?'), ('general', 'recomiéndenme una serie para el finde'), ('general', 'volví del laburo, estoy muerto'), ('general', 'qué lindo día para no hacer nada'), ('general', 'me compré una yerba nueva y es una bomba'), ('general', 'buen día gente linda ☀️'), ('general', '¿qué están haciendo?'), ('general', 'acá tomando unos mates mirando la lluvia'), ('general', 'se cortó la luz en todo el barrio jaja'), ('general', '¿pizza o empanadas para esta noche?'), ('general', 'empanadas obvio, no se discute'), ('general', 'alguien más que trabaje desde la casa? me estoy volviendo loco'), ('general', 'mañana arranco el gimnasio (llevo 3 años diciendo esto)'), ('general', 'qué buena onda este server, la verdad'), ('general', 'llegué a casa y el perro me comió las zapatillas 🙃'), ('general', '¿vieron que mañana es feriado? ah no, me equivoqué'), ('general', 'hoy aprendí a hacer pan casero y salió bastante bien'), ('general', 'me dormí 12 horas y sigo cansado'), ('general', '¿quién se suma a un truco online?');
insert into public.fogon_bot_lines (tag, body) values ('memes', 'cuando decís ''último capítulo'' a las 2 am 💀'), ('memes', 'yo: me voy a dormir temprano. también yo a las 4 am: 👁️👄👁️'), ('memes', 'el wifi cuando más lo necesitás: 🐌'), ('memes', 'mi viejo mandando audios de 7 minutos 😂'), ('memes', 'POV: tu mamá dice ''tenemos comida en casa'''), ('memes', 'cuando el profe dice ''esto no entra en el parcial'' y entra'), ('memes', 'el carpincho no tiene problemas, sé como el carpincho 🦫'), ('memes', 'nadie: absolutamente nadie: el colectivo pasando lleno'), ('memes', 'hice un meme pero me dio vergüenza subirlo'), ('memes', 'jajajaja este server es todo meme'), ('memes', 'me reí 10 minutos con el de arriba'), ('memes', 'ese meme ya lo vi en 2019 pero igual me río'), ('memes', 'el lunes llegando como si nada 🙄');
insert into public.fogon_bot_lines (tag, body) values ('musica', 'temazo lo que estoy escuchando ahora mismo 🎶'), ('musica', '¿alguien escucha rock nacional de los 80?'), ('musica', 'pásenme bandas nuevas que estoy aburrido de mi playlist'), ('musica', 'hoy en la radio pusieron un clásico y me emocioné'), ('musica', 'estoy aprendiendo a tocar la guitarra, ya sé tres acordes jaja'), ('musica', 'cumbia para limpiar la casa, no falla'), ('musica', '¿vieron el recital de anoche? impresionante'), ('musica', 'me armé una playlist para programar, después la paso'), ('musica', 'el bajo de ese tema es una locura'), ('musica', 'necesito auriculares nuevos, ¿recomiendan alguno?'), ('musica', '¿alguien toca en una banda?'), ('musica', 'cantando a los gritos en la ducha como corresponde 🎤');
insert into public.fogon_bot_lines (tag, body) values ('juegos', 'gané 3 rankeds seguidas, estoy on fire 🔥'), ('juegos', '¿alguien para jugar algo esta noche?'), ('juegos', 'perdí contra un nene de 12 años y me insultó en tres idiomas'), ('juegos', 'se viene la actualización nueva, ¿qué opinan?'), ('juegos', 'estoy jugando un indie buenísimo, después les paso el nombre'), ('juegos', 'el lag de hoy está terrible'), ('juegos', 'volví a jugar al buscaminas y no me arrepiento'), ('juegos', '¿truco o chinchón?'), ('juegos', 'me compré un joystick nuevo y ya lo tiré contra el sillón'), ('juegos', '¿alguien juega al ajedrez online? armemos torneo'), ('juegos', 'speedrun de lavar los platos: 4 minutos, récord personal');
insert into public.fogon_bot_lines (tag, body) values ('programacion', 'hoy rompí producción y lo arreglé antes de que alguien se diera cuenta 😅'), ('programacion', '¿Supabase o Firebase? flame war en 3, 2, 1…'), ('programacion', 'me pasé 2 horas buscando un bug y era una coma'), ('programacion', 'React o Vue, ¿qué usan ustedes?'), ('programacion', 'aprendí a usar Git bien por fin, bueno, más o menos'), ('programacion', 'el CSS me odia y yo lo odio a él'), ('programacion', '¿alguien sabe Python? tengo una duda con listas'), ('programacion', 'funcionaba en mi máquina 🤷'), ('programacion', 'tip: poné RLS en todas las tablas, no se van a arrepentir'), ('programacion', 'estoy armando un bot de Discord en Python'), ('programacion', 'hice mi primera API y me siento un hacker'), ('programacion', 'el café es el combustible de este proyecto ☕'), ('programacion', 'console.log(''acá llega'') — debugging profesional');
insert into public.fogon_bot_lines (tag, body) values ('ayuda', '¿cómo cambio mi foto de perfil? → engranaje abajo a la izquierda, Perfiles'), ('ayuda', 'tip: con Ctrl+K buscás cualquier canal o persona'), ('ayuda', 'para fijar un mensaje pasá el mouse y tocá el alfiler 📌'), ('ayuda', 'si alguien molesta, lo podés bloquear desde su perfil'), ('ayuda', '¿se pueden mandar imágenes? sí, con el + al lado de la caja de texto'), ('ayuda', 'para agregar amigos: tocá el logo de arriba a la izquierda → Añadir amigo');
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('(?i)\m(hola|buenas|buen día|buenos días|holis|qué tal)\M', array['¡Buenas {u}! Bienvenide al fogón 🔥', '¡Hola {u}! ¿Cómo va?', 'Ey {u}, ¿todo bien? 👋', '¡Buenas {u}! Pasá que hay mate 🧉'], 0);
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('(?i)(\?\s*$)', array['Buena pregunta {u}, yo creo que sí 🤔', 'Mmm {u}, no sé, ¿alguien sabe?', '{u} uff, me hiciste pensar', 'Depende {u}, contame más'], 1);
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('(?i)(jaj|jsj|😂|🤣)', array['jajaja {u} 😂', '{u} me hiciste reír', 'jajaja tal cual {u}'], 2);
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('(?i)(mate|asado|empanada|pizza)', array['{u} uh, ahora tengo hambre 🤤', '¡{u} invitá!', '{u} eso sí que es cultura'], 3);
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('(?i)(gracias|genial|buenísimo|crack)', array['¡De nada {u}! 🙌', '{u} un placer', '¡Vamos {u}! 🔥'], 4);
insert into public.fogon_bot_replies (pattern, bodies, prio) values ('.', array['Totalmente {u} 👍', 'Eso {u}!', 'Mirá vos {u}, no sabía', '{u} jaja sí', 'Qué bueno {u} 🔥', 'Coincido con {u}', '{u} contá más'], 99);
alter table public.fogon_bot_channels enable row level security;
revoke all on public.fogon_bot_channels from anon, authenticated;
alter table public.fogon_bot_lines enable row level security;
revoke all on public.fogon_bot_lines from anon, authenticated;
alter table public.fogon_bot_replies enable row level security;
revoke all on public.fogon_bot_replies from anon, authenticated;
alter table public.fogon_bot_replied enable row level security;
revoke all on public.fogon_bot_replied from anon, authenticated;

-- ---------- mensajes fijos de bienvenida y anuncios ----------
alter table public.fogon_messages disable trigger fogon_messages_before;
insert into public.fogon_messages (id, channel_id, author_id, content, created_at, pinned_at, pinned_by)
select gen_random_uuid(), 'ee962bfd-d9e5-5682-b3e9-7cb4ea3c354e', '5b562d7b-f31b-5b40-b5f1-d36a0d8d1d2a', x.body, now() - interval '20 days' + x.n * interval '1 minute', now() - interval '20 days', '5b562d7b-f31b-5b40-b5f1-d36a0d8d1d2a'
from (values (1, '# Bienvenide a la Comunidad de Fogón 🔥'),
             (2, E'**Reglas:**\n1. Respeto ante todo. Nada de insultos ni discriminación.\n2. Nada de spam ni publicidad.\n3. Cada tema en su canal.\n4. Pasala bien 🧉'),
             (3, 'Los miembros con la etiqueta **BOT** son bots de la comunidad: charlan solos para que el fogón nunca esté vacío. Las personas de verdad no la tienen.'),
             (4, 'Si necesitás algo, preguntá en #ayuda-fogón.')) as x(n, body)
where not exists (select 1 from public.fogon_messages where channel_id = 'ee962bfd-d9e5-5682-b3e9-7cb4ea3c354e');
insert into public.fogon_messages (channel_id, author_id, content, created_at)
select '9b58a035-f39d-5f53-8822-696ae155f652', 'e7809edc-8559-4df6-8d2b-1fffc7a27719', x.body, now() - x.d * interval '1 day'
from (values (6, '¡Abrimos la Comunidad de Fogón! 🎉 Todos los que se registren entran solos.'),
             (3, 'Novedad: ahora hay perfiles con foto, banner y tema de colores. Probalo desde el engranaje ⚙️'),
             (1, 'Novedad: amigos, mensajes fijados, búsqueda y permisos por categoría. ¡Como Discord pero con mate! 🧉')) as x(d, body)
where not exists (select 1 from public.fogon_messages where channel_id = '9b58a035-f39d-5f53-8822-696ae155f652');

-- historial de charla de los últimos dos días, para que no arranque vacío
insert into public.fogon_messages (channel_id, author_id, content, created_at)
select bc.channel_id, b.id, l.body, now() - (random() * interval '44 hours') - interval '20 minutes'
from public.fogon_bot_lines l
join public.fogon_bot_channels bc on bc.tag = l.tag
cross join lateral (select id from public.fogon_profiles where is_bot and username <> 'guardian' and l.id is not null order by md5(l.id::text || id::text) limit 1) b
where l.tag in ('general','memes','musica','juegos','programacion') and random() < 0.75
  and not exists (select 1 from public.fogon_messages m where m.channel_id = bc.channel_id);
alter table public.fogon_messages enable trigger fogon_messages_before;

insert into public.fogon_reactions (message_id, user_id, emoji)
select m.id, b.id, (array['🔥','😂','👍','❤️','🙌','💯','😮','🧉','⚽','🎮','👀'])[1 + floor(random() * 11)::int]
from public.fogon_messages m join public.fogon_channels c on c.id = m.channel_id and c.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
cross join lateral (select id from public.fogon_profiles where is_bot and id <> m.author_id order by random() limit 1 + floor(random() * 3)::int) b
where random() < 0.35
on conflict do nothing;

-- ---------- los bots charlan solos (cada minuto) ----------
create or replace function public.fogon_bots_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  quiet boolean := v_hour between 3 and 8;
  ch uuid; v_tag text; bot uuid; v_body text; h record; rep text;
begin
  -- 1) responder a las personas (no a otros bots) en la comunidad
  for h in
    select m.id, m.channel_id, m.content, p.username, m.mentions
    from public.fogon_messages m
    join public.fogon_channels c on c.id = m.channel_id and c.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
    join public.fogon_profiles p on p.id = m.author_id and not p.is_bot
    join public.fogon_bot_channels bc on bc.channel_id = m.channel_id and bc.tag not in ('reglas', 'anuncios')
    where m.created_at > now() - interval '15 minutes' and m.created_at < now() - interval '20 seconds'
      and not exists (select 1 from public.fogon_bot_replied r where r.message_id = m.id)
    order by m.created_at limit 5
  loop
    insert into public.fogon_bot_replied (message_id) values (h.id) on conflict do nothing;
    -- siempre si mencionan a un bot, saludan o preguntan; si no, a veces
    select id into bot from public.fogon_profiles where is_bot and id = any(h.mentions) order by random() limit 1;
    if bot is null and not (h.content ~* '(\m(hola|buenas|holis)\M|\?\s*$)' or random() < 0.35) then continue; end if;
    if bot is null then
      select id into bot from public.fogon_profiles where is_bot and username <> 'guardian' order by random() limit 1;
    end if;
    select bodies[1 + floor(random() * array_length(bodies, 1))::int] into rep
    from public.fogon_bot_replies where h.content ~ pattern order by prio limit 1;
    insert into public.fogon_messages (channel_id, author_id, content, reply_to_id)
    values (h.channel_id, bot, replace(rep, '{u}', '@' || h.username), h.id);
    -- y alguna reacción
    if random() < 0.6 then
      insert into public.fogon_reactions (message_id, user_id, emoji)
      select h.id, id, (array['🔥','😂','👍','❤️','🙌','💯','😮','🧉','⚽','🎮','👀'])[1 + floor(random() * 11)::int] from public.fogon_profiles where is_bot order by random() limit 1
      on conflict do nothing;
    end if;
  end loop;

  -- 2) charla espontánea
  if random() < (case when quiet then 0.04 else 0.3 end) then
    select bc.channel_id, bc.tag into ch, v_tag from public.fogon_bot_channels bc
    where bc.tag in ('general','general','memes','musica','juegos','programacion') order by random() limit 1;
    select p.id into bot from public.fogon_profiles p
    where p.is_bot and p.username <> 'guardian'
      and p.id is distinct from (select author_id from public.fogon_messages where channel_id = ch order by created_at desc limit 1)
    order by random() limit 1;
    select l.body into v_body from public.fogon_bot_lines l
    where l.tag = v_tag and not exists (
      select 1 from (select content from public.fogon_messages where channel_id = ch order by created_at desc limit 40) recent where recent.content = l.body)
    order by random() limit 1;
    if v_body is not null then
      insert into public.fogon_messages (channel_id, author_id, content) values (ch, bot, v_body);
    end if;
  end if;

  -- 3) reacciones a mensajes recientes
  if random() < (case when quiet then 0.03 else 0.25 end) then
    insert into public.fogon_reactions (message_id, user_id, emoji)
    select m.id, b.id, (array['🔥','😂','👍','❤️','🙌','💯','😮','🧉','⚽','🎮','👀'])[1 + floor(random() * 11)::int]
    from (select m.id, m.author_id from public.fogon_messages m join public.fogon_channels c on c.id = m.channel_id and c.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
          where m.created_at > now() - interval '3 hours' order by random() limit 1) m
    cross join lateral (select id from public.fogon_profiles where is_bot and id <> m.author_id order by random() limit 1) b
    on conflict do nothing;
  end if;

  -- 4) los estados cambian de a poco (de noche, casi todos ausentes)
  if random() < 0.15 then
    update public.fogon_profiles set status = case
        when quiet then (array['idle','idle','idle','online'])[1 + floor(random() * 4)::int]
        else (array['online','online','online','idle','dnd'])[1 + floor(random() * 5)::int] end
    where id = (select id from public.fogon_profiles where is_bot and username <> 'guardian' order by random() limit 1);
  end if;

  delete from public.fogon_bot_replied where at < now() - interval '1 day';
end $$;
revoke execute on function public.fogon_bots_tick() from public, anon, authenticated;

-- ---------- quien se registra entra solo a la comunidad ----------
create or replace function public.fogon_join_community()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_bot then return new; end if;
  insert into public.fogon_members (server_id, user_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', new.id) on conflict do nothing;
  insert into public.fogon_member_roles (server_id, user_id, role_id)
  select 'e56307db-6dfc-5a65-88a3-486d38ec17c2', new.id, r.id from public.fogon_roles r where r.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2' and r.auto_assign on conflict do nothing;
  return new;
end $$;
drop trigger if exists fogon_join_community on public.fogon_profiles;
create trigger fogon_join_community after insert on public.fogon_profiles for each row execute function public.fogon_join_community();
revoke execute on function public.fogon_join_community() from public, anon, authenticated;


select cron.schedule('fogon-bots', '* * * * *', 'select public.fogon_bots_tick()');
