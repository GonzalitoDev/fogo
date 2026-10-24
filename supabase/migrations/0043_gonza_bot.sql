-- "gonza (bot)": un bot que habla como @gonza (con la etiqueta BOT, como todos).
-- Contesta cuando lo mencionan o le escriben por privado, y de vez en cuando tira una frase
-- en la comunidad. Va aprendiendo frases de lo que gonza escribe en canales públicos
-- (nunca de sus mensajes privados), filtrando menciones, comandos y cosas personales.

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, banner_color, created_at)
select '7c1d1f00-0000-4000-8000-0000000060a1', 'gonza.bot', 'gonza (bot)', coalesce(p.color, '#e07a3f'), '', '🤖 el gemelo de @gonza',
  'El bot de @gonza 🤖🧉 Hablo como él cuando no está.' || chr(10) || 'Si querés hablar con el posta, escribile a @gonza.',
  'online', true, coalesce(p.banner_color, p.color, '#e07a3f'), now()
from public.fogon_profiles p where p.id = 'e7809edc-8559-4df6-8d2b-1fffc7a27719'
on conflict (id) do nothing;

insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-0000000060a1', now()) on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-0000000060a1', 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;

-- respuestas con el estilo de gonza (corto, minúscula, argento)
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('gonza.bot', 'greet', 'hola'), ('gonza.bot', 'greet', 'hola {n}'), ('gonza.bot', 'greet', 'eu que onda'), ('gonza.bot', 'greet', 'buenas buenas 🧉'), ('gonza.bot', 'greet', 'hola che, todo bien?'),
  ('gonza.bot', 'howareyou', 'TD BIEN y vos?'), ('gonza.bot', 'howareyou', 'bien bien, programando como siempre jaja'), ('gonza.bot', 'howareyou', 'todo tranqui, metiéndole al fogón 🔥'), ('gonza.bot', 'howareyou', 're bien, con un mate al lado 🧉'),
  ('gonza.bot', 'laugh', 'jajaja'), ('gonza.bot', 'laugh', 'jajajaj posta'), ('gonza.bot', 'laugh', 'jaja re'), ('gonza.bot', 'laugh', '😂😂'),
  ('gonza.bot', 'thanks', 'de nada'), ('gonza.bot', 'thanks', 'dale, de nada {n}'), ('gonza.bot', 'thanks', 'nada que agradecer 🤝'),
  ('gonza.bot', 'nice', 'que bueno'), ('gonza.bot', 'nice', 'que bueno che'), ('gonza.bot', 'nice', 'buenísimo'), ('gonza.bot', 'nice', 'eso 🔥'),
  ('gonza.bot', 'question', 'mmm no sé, preguntale al gonza de verdad jaja'), ('gonza.bot', 'question', 'si'), ('gonza.bot', 'question', 'creo que si, después lo veo'), ('gonza.bot', 'question', 'buena pregunta, lo pienso y te digo'),
  ('gonza.bot', 'what', 'que no sabias'), ('gonza.bot', 'what', 'jaja que cosa'), ('gonza.bot', 'what', 'ni idea posta'),
  ('gonza.bot', 'where', 'acá, en el fogón 🔥'), ('gonza.bot', 'where', 'en casa programando'), ('gonza.bot', 'where', 'por acá dando vueltas'),
  ('gonza.bot', 'bye', 'chau chau'), ('gonza.bot', 'bye', 'nos vemos {n} 👋'), ('gonza.bot', 'bye', 'dale, después hablamos'),
  ('gonza.bot', 'bot', 'si jaja soy el bot de gonza 🤖 el posta es gonza'), ('gonza.bot', 'bot', 'soy un bot, pero hablo como él jaja. para el de verdad: gonza'),
  ('gonza.bot', 'fallback', 'si'), ('gonza.bot', 'fallback', 'que bueno'), ('gonza.bot', 'fallback', 'jaja dale'), ('gonza.bot', 'fallback', 'posta?'), ('gonza.bot', 'fallback', 're'),
  ('gonza.bot', 'fallback', 'mirá vos'), ('gonza.bot', 'fallback', 'después le cuento a gonza 😎'), ('gonza.bot', 'fallback', 'eu no digas nada jaja'), ('gonza.bot', 'fallback', 'ahí va'),
  ('gonza.bot', 'opener', 'eu {n}, todo bien?'), ('gonza.bot', 'opener', 'hola {n} 👋 qué contás?'),
  ('gonza.bot', 'h_creador', 'el fogón lo hizo gonza, o sea yo pero de verdad jaja 😎'),
  ('gonza.bot', 'vc_greet', 'eu hola'), ('gonza.bot', 'vc_fallback', 'jaja si'), ('gonza.bot', 'vc_bye', 'chau chau'), ('gonza.bot', 'vc_question', 'ni idea, preguntale al gonza posta');

-- frases para tirar en la comunidad: algunas de arranque y las que va aprendiendo
create table if not exists public.fogon_gonza_phrases (
  id bigserial primary key,
  body text not null unique check (length(body) between 2 and 140),
  learned boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.fogon_gonza_phrases enable row level security;
revoke all on public.fogon_gonza_phrases from anon, authenticated;

insert into public.fogon_gonza_phrases (body) values
  ('hola'), ('que onda gente'), ('alguien despierto?'), ('TD BIEN'), ('que bueno'), ('buenas buenas 🧉'),
  ('estoy metiéndole cosas nuevas al fogón, atentos 👀'), ('si encuentran un bug avísenme jaja'), ('quién se prende a la radio? 📻'),
  ('mate y código, el combo perfecto 🧉💻'), ('che, qué les gustaría que agregue al fogón?'), ('se viene algo lindo 🔥'),
  ('quién juega algo hoy? 🎮'), ('jajaja posta'), ('gente, inviten amigos que esto está re lindo')
on conflict (body) do nothing;

-- aprende de lo que gonza escribe en canales públicos de servidores (nada de privados)
create or replace function public.fogon_gonza_learn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text := btrim(new.content);
begin
  if new.author_id <> 'e7809edc-8559-4df6-8d2b-1fffc7a27719'::uuid then return null; end if;
  if not exists (select 1 from public.fogon_channels c where c.id = new.channel_id and c.kind = 'text' and c.server_id is not null) then return null; end if;
  if length(v) < 2 or length(v) > 140 or v ~ '^[!/]' or v ~ '@' or v ~ 'https?://' or v ~ '\*\*'
     or v ~* '(amor|linda|lindo|hermosa|te quiero|te amo|beso|novia|contraseña|password|mail|tel[eé]fono|direcci[oó]n|\m\d{6,}\M)' then
    return null;
  end if;
  insert into public.fogon_gonza_phrases (body, learned) values (v, true) on conflict (body) do nothing;
  return null;
end $$;
revoke execute on function public.fogon_gonza_learn() from public, anon, authenticated;
create or replace trigger fogon_gonza_learn after insert on public.fogon_messages for each row execute function public.fogon_gonza_learn();

-- de vez en cuando tira una frase en un canal abierto de la comunidad que tenga movimiento
create or replace function public.fogon_gonza_bot_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  v_ch uuid; v_body text;
begin
  if random() > 0.12 then return; end if;
  -- no más de una cada 25 minutos
  if exists (select 1 from public.fogon_messages where author_id = bot and created_at > now() - interval '25 minutes') then return; end if;
  if exists (select 1 from public.fogon_bot_queue where bot_id = bot and sent_at is null) then return; end if;
  select c.id into v_ch from public.fogon_channels c
  where c.server_id = community and c.kind = 'text'
    and public.fogon_channel_allows_for(c.id, 'send_messages', bot)
    and c.name !~* '(bienvenida|anuncio|registro|ticket|cerrado|noticia)'
    and exists (select 1 from public.fogon_messages m where m.channel_id = c.id and m.created_at > now() - interval '3 hours')
  order by random() limit 1;
  if v_ch is null then return; end if;
  -- prefiere lo aprendido, sin repetir lo último que dijo
  select body into v_body from public.fogon_gonza_phrases p
  where not exists (select 1 from public.fogon_messages m where m.author_id = bot and m.content = p.body and m.created_at > now() - interval '3 days')
  order by random() * (case when p.learned then 1 else 1.6 end) limit 1;
  if v_body is null then return; end if;
  insert into public.fogon_bot_queue (channel_id, bot_id, body, typing_at, send_at)
  values (v_ch, bot, v_body, now() + interval '2 seconds', now() + make_interval(secs => 4 + least(length(v_body), 80) * 0.06));
end $$;
revoke execute on function public.fogon_gonza_bot_tick() from public, anon, authenticated;
select cron.schedule('fogon-gonza-bot', '* * * * *', 'select public.fogon_gonza_bot_tick()');

-- en la charla genérica de bots, juegos y voz no entra (habla con sus propias frases)
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc like '%''radio.fogon'', ''fogon''%' and p.proname <> 'fogon_bot_on_message' loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, '''radio.fogon'', ''fogon''', '''radio.fogon'', ''fogon'', ''gonza.bot''');
    execute def;
  end loop;
end $$;

-- cuando lo mencionan en un canal, contesta con su estilo (no con las frases genéricas de los bots)
do $$
declare def text := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
begin
  def := replace(def, '    if bot is null then return null; end if;
    select bodies[1 + floor(random() * array_length(bodies, 1))::int] into v_body', '    if bot is null then return null; end if;
    if bot = ''7c1d1f00-0000-4000-8000-0000000060a1'' then
      v_body := public.fogon_bot_line(bot, public.fogon_bot_kind(new.content, ''gonza.bot''), new.author_id, new.channel_id);
    else
    select bodies[1 + floor(random() * array_length(bodies, 1))::int] into v_body');
  def := replace(def, '    select replace(v_body, ''{u}'', ''@'' || username) into v_body from public.fogon_profiles where id = new.author_id;
  end if;', '    select replace(v_body, ''{u}'', ''@'' || username) into v_body from public.fogon_profiles where id = new.author_id;
    end if;
  end if;');
  if position('0000000060a1' in def) = 0 then raise exception 'no pude ajustar fogon_bot_on_message'; end if;
  execute def;
end $$;
