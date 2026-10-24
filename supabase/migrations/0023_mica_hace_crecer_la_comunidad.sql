-- Mica hace crecer la Comunidad de Fogón:
--  * Invitaciones con referido: cada link lleva tu @; cuando alguien nuevo entra con él, Mica lo
--    festeja en #general, te agradece por privado y con 3 invitados te da la insignia Embajador.
--  * Campaña: una vez por semana le escribe a cada miembro activo con su link para invitar amigos.
--  * Encuestas con reacciones, miembro destacado de la semana, noche de juegos los viernes
--    y, si #general está muy tranquilo, tira un tema para charlar.

-- nueva insignia: Embajador (se reemplaza el check de la lista de insignias)
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.fogon_badges'::regclass and contype = 'c' loop
    execute format('alter table public.fogon_badges drop constraint %I', c);
  end loop;
end $$;
alter table public.fogon_badges add constraint fogon_badges_badge_check
  check (badge = any (array['fundador', 'staff', 'moderador', 'cazabugs', 'dev', 'artista', 'vip', 'embajador']));

/* ---------- referidos ---------- */

create table if not exists public.fogon_referrals (
  user_id uuid primary key references public.fogon_profiles(id) on delete cascade,
  referrer_id uuid not null references public.fogon_profiles(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.fogon_referrals enable row level security;
create policy fogon_referrals_read on public.fogon_referrals for select to authenticated using (referrer_id = auth.uid() or user_id = auth.uid());
grant select on public.fogon_referrals to authenticated;

create or replace function public.fogon_my_referrals()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.fogon_referrals where referrer_id = auth.uid();
$$;

-- la llama la app de quien recién se creó la cuenta, si llegó con ?ref=usuario
create or replace function public.fogon_claim_referral(p_ref text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  me public.fogon_profiles; ref public.fogon_profiles; n int; cid uuid;
begin
  if auth.uid() is null then return 'sin sesión'; end if;
  select * into me from public.fogon_profiles where id = auth.uid();
  select * into ref from public.fogon_profiles where username = lower(trim(both '@' from coalesce(p_ref, '')));
  if me.id is null or ref.id is null or ref.id = me.id or ref.is_bot then return 'no'; end if;
  if me.created_at < now() - interval '3 days' then return 'cuenta vieja'; end if;
  insert into public.fogon_referrals (user_id, referrer_id) values (me.id, ref.id) on conflict do nothing;
  if not found then return 'ya'; end if;

  select count(*) into n from public.fogon_referrals where referrer_id = ref.id;
  perform public.fogon_bot_enqueue(general, mica,
    '🎉 ¡Bienvenide @' || me.username || '! Llegó invitade por @' || ref.username || ' 🙌 Gracias por hacer crecer el fogón 🔥', null, interval '8 seconds');

  cid := public.fogon_bot_dm_channel(mica, ref.id);
  if cid is not null then
    perform public.fogon_bot_enqueue(cid, mica,
      '¡Gracias por invitar a @' || me.username || '! 💜 Ya llevás **' || n || '** invitado' || case when n = 1 then '' else 's' end || '.' ||
      case when n < 3 then ' Con ' || (3 - n) || ' más te ganás la insignia **Embajador** 🏅' else '' end, null, interval '20 seconds');
  end if;

  if n >= 3 and not exists (select 1 from public.fogon_badges where user_id = ref.id and badge = 'embajador') then
    insert into public.fogon_badges (user_id, badge, granted_by) values (ref.id, 'embajador', null) on conflict do nothing;
    perform public.fogon_bot_enqueue('9b58a035-f39d-5f53-8822-696ae155f652', mica,
      '🏅 **Nuevo Embajador del Fogón:** @' || ref.username || ' ya trajo ' || n || ' personas a la comunidad. ¡Gracias! 🔥', null, interval '30 seconds');
  end if;
  return 'ok';
end $$;
revoke execute on function public.fogon_claim_referral(text) from public, anon;
grant execute on function public.fogon_claim_referral(text) to authenticated;
revoke execute on function public.fogon_my_referrals() from public, anon;
grant execute on function public.fogon_my_referrals() to authenticated;

/* ---------- encuestas ---------- */

create table if not exists public.fogon_polls (id serial primary key, q text not null, opts text[] not null, emojis text[] not null);
alter table public.fogon_polls enable row level security;
insert into public.fogon_polls (q, opts, emojis) values
  ('¿Qué hacemos el finde?', array['Noche de juegos', 'Zapada musical', 'Ver una peli juntos'], array['🎮', '🎸', '🎬']),
  ('¿Mate dulce o amargo?', array['Dulce', 'Amargo', 'No tomo mate (?)'], array['🍯', '🧉', '😶']),
  ('¿Qué canal nuevo les gustaría?', array['#fotos-de-mascotas', '#recetas', '#series-y-pelis'], array['🐶', '🍝', '📺']),
  ('¿A qué juego le damos el viernes?', array['Among Us', 'Minecraft', 'Valorant', 'FIFA'], array['🔪', '⛏️', '🔫', '⚽']),
  ('¿Cuándo se conectan más?', array['A la mañana', 'A la tarde', 'A la noche', 'De madrugada'], array['☀️', '🌤️', '🌙', '🦉']),
  ('¿Qué le sumamos a Fogón?', array['Stickers propios', 'Más juegos con los bots', 'Eventos semanales'], array['🎨', '🤖', '📅']),
  ('¿Pizza o empanadas?', array['Pizza', 'Empanadas', 'Las dos, obvio'], array['🍕', '🥟', '🤤']);

create or replace function public.fogon_mica_poll()
returns void language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  p record; v_body text; v_id uuid; i int;
begin
  select * into p from public.fogon_polls pl
  where not exists (select 1 from public.fogon_messages m where m.channel_id = general and m.author_id = mica and m.content like '%' || pl.q || '%' and m.created_at > now() - interval '30 days')
  order by random() limit 1;
  if p.id is null then return; end if;
  v_body := '📊 **Encuesta:** ' || p.q || chr(10);
  for i in 1 .. array_length(p.opts, 1) loop
    v_body := v_body || chr(10) || p.emojis[i] || '  ' || p.opts[i];
  end loop;
  v_body := v_body || chr(10) || chr(10) || 'Voten con las reacciones 👇';
  insert into public.fogon_messages (channel_id, author_id, content) values (general, mica, v_body) returning id into v_id;
  for i in 1 .. array_length(p.emojis, 1) loop
    insert into public.fogon_reactions (message_id, user_id, emoji) values (v_id, mica, p.emojis[i]) on conflict do nothing;
  end loop;
end $$;
revoke execute on function public.fogon_mica_poll() from public, anon, authenticated;

-- los bots también votan (de a poco)
create or replace function public.fogon_bots_vote()
returns void language plpgsql security definer set search_path = '' as $$
declare m record; v_emoji text;
begin
  for m in select id, content from public.fogon_messages
    where author_id = '7c1d1f00-0000-4000-8000-00000000ca01' and content like '📊 **Encuesta:**%' and created_at > now() - interval '6 hours'
  loop
    if random() < 0.15 then
      select emoji into v_emoji from public.fogon_reactions where message_id = m.id and user_id = '7c1d1f00-0000-4000-8000-00000000ca01' order by random() limit 1;
      insert into public.fogon_reactions (message_id, user_id, emoji)
      select m.id, p.id, v_emoji from public.fogon_profiles p
      where p.is_bot and p.username not in ('sofi', 'modmail', 'guardian', 'mica.cm')
        and not exists (select 1 from public.fogon_reactions r where r.message_id = m.id and r.user_id = p.id)
      order by random() limit 1
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public.fogon_bots_vote() from public, anon, authenticated;

/* ---------- la agenda de Mica ---------- */

create table if not exists public.fogon_mica_done (key text primary key, at timestamptz not null default now());
alter table public.fogon_mica_done enable row level security;

create or replace function public.fogon_mica_grow()
returns void language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  anuncios uuid := '9b58a035-f39d-5f53-8822-696ae155f652';
  site text := 'https://fogo-orpin.vercel.app/?invite=comunidad&ref=';
  v_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_hour int := extract(hour from v_local);
  v_dow int := extract(dow from v_local); -- 0 domingo … 5 viernes
  v_week text := to_char(v_local, 'IYYY-IW');
  v_day text := to_char(v_local, 'YYYY-MM-DD');
  who record; cid uuid; v_line text; v_last timestamptz;
begin
  -- 1) campaña de invitaciones: a cada miembro activo, una vez por semana
  if v_hour between 12 and 22 and random() < 0.03 then
    select p.id, p.username, p.display_name into who from public.fogon_profiles p
    join public.fogon_members m on m.user_id = p.id and m.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
    where not p.is_bot
      and exists (select 1 from public.fogon_messages x where x.author_id = p.id and x.created_at > now() - interval '7 days')
      and not exists (select 1 from public.fogon_mica_done d where d.key = 'invita:' || p.id || ':' || v_week)
    order by random() limit 1;
    if who.id is not null then
      insert into public.fogon_mica_done (key) values ('invita:' || who.id || ':' || v_week) on conflict do nothing;
      cid := public.fogon_bot_dm_channel(mica, who.id);
      if cid is not null then
        perform public.fogon_bot_enqueue(cid, mica,
          '¡Hola ' || who.display_name || '! 👋 Gracias por estar siempre en el fogón 🔥' || chr(10) || chr(10) ||
          '¿Tenés amigos a los que les pueda gustar la comunidad? Pasales tu link personal:' || chr(10) || site || who.username || chr(10) || chr(10) ||
          'Por cada persona que se sume te aviso, y con **3 invitados** te ganás la insignia **Embajador** 🏅', null, interval '2 seconds');
      end if;
    end if;
  end if;

  -- 2) encuesta: martes y sábado a la tarde
  if v_dow in (2, 6) and v_hour between 16 and 19 and random() < 0.04
     and not exists (select 1 from public.fogon_mica_done where key = 'encuesta:' || v_day) then
    insert into public.fogon_mica_done (key) values ('encuesta:' || v_day) on conflict do nothing;
    perform public.fogon_mica_poll();
  end if;

  -- 3) miembro destacado: domingos a la noche
  if v_dow = 0 and v_hour = 20 and not exists (select 1 from public.fogon_mica_done where key = 'destacado:' || v_week) then
    select p.username, count(*) n into who from public.fogon_messages x
    join public.fogon_channels c on c.id = x.channel_id and c.server_id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2'
    join public.fogon_profiles p on p.id = x.author_id and not p.is_bot
    where x.created_at > now() - interval '7 days' and x.content not like '🛡️ *Mensaje bloqueado%'
    group by p.username order by count(*) desc limit 1;
    insert into public.fogon_mica_done (key) values ('destacado:' || v_week) on conflict do nothing;
    if who.username is not null then
      perform public.fogon_bot_enqueue(anuncios, mica,
        '⭐ **Miembro destacado de la semana:** @' || who.username || ' 🎉 Gracias por darle vida al fogón con ' || who.n || ' mensajes. ¡Aplausos! 👏', null, interval '2 seconds');
    end if;
  end if;

  -- 4) noche de juegos de los viernes: aviso a la tarde y arranque a las 22
  if v_dow = 5 and v_hour = 18 and not exists (select 1 from public.fogon_mica_done where key = 'evento-aviso:' || v_day) then
    insert into public.fogon_mica_done (key) values ('evento-aviso:' || v_day) on conflict do nothing;
    perform public.fogon_bot_enqueue(anuncios, mica,
      '📣 **Hoy es viernes de juegos** 🎮 A las 22 h nos juntamos en el canal de voz **Gaming**. ¡Traigan ganas y auriculares! @everyone', null, interval '2 seconds');
  end if;
  if v_dow = 5 and v_hour = 22 and not exists (select 1 from public.fogon_mica_done where key = 'evento-arranca:' || v_day) then
    insert into public.fogon_mica_done (key) values ('evento-arranca:' || v_day) on conflict do nothing;
    perform public.fogon_bot_enqueue(general, mica, '🎮 ¡Arrancó la noche de juegos! Vengan al canal de voz **Gaming**, ya hay gente 🔥', null, interval '2 seconds');
  end if;

  -- 5) si #general está muy tranquilo, Mica tira un tema
  if v_hour between 10 and 23 then
    select max(created_at) into v_last from public.fogon_messages where channel_id = general;
    if (v_last is null or v_last < now() - interval '90 minutes') and random() < 0.1 then
      select l.body into v_line from public.fogon_bot_lines l where l.tag = 'cm_general'
        and not exists (select 1 from (select content from public.fogon_messages where channel_id = general order by created_at desc limit 80) r where r.content = l.body)
        order by random() limit 1;
      if v_line is not null then perform public.fogon_bot_enqueue(general, mica, v_line, null, interval '2 seconds'); end if;
    end if;
  end if;
end $$;
revoke execute on function public.fogon_mica_grow() from public, anon, authenticated;

insert into public.fogon_bot_lines (tag, body) values
  ('cm_general', '¿Qué serie están mirando? Necesito recomendaciones 📺'),
  ('cm_general', 'Si pudieran sumar un canal nuevo al fogón, ¿cuál sería? 🤔'),
  ('cm_general', 'Cuenten algo lindo que les pasó esta semana ✨'),
  ('cm_general', '¿Quién se suma a la noche de juegos del viernes? 🎮'),
  ('cm_general', 'Recuerden que pueden invitar amigos con su link (menú del servidor → Invitar gente) 🔥 Mientras más, mejor'),
  ('cm_anuncio', '📣 **Invitá a tus amigos:** cada link de invitación lleva tu nombre. Con 3 amigos que se sumen te llevás la insignia **Embajador** 🏅');

select cron.schedule('fogon-mica-crece', '* * * * *', 'select public.fogon_mica_grow(); select public.fogon_bots_vote();');

-- los viernes de 22 a 0 los bots tienen muchas más ganas de entrar a Gaming
do $$
declare def text := pg_get_functiondef('public.fogon_bots_voice_tick'::regproc);
begin
  def := replace(def, 'if v_test then v_p := case when v_hour = any(b.hours) then 1 else 0 end; end if;',
    'if extract(dow from now() at time zone ''America/Argentina/Buenos_Aires'') = 5 and v_hour in (22, 23) and v_room = gaming then v_p := v_p * 6; end if;
    if v_test then v_p := case when v_hour = any(b.hours) then 1 else 0 end; end if;');
  if position('* 6' in def) = 0 then raise exception 'no pude ajustar fogon_bots_voice_tick'; end if;
  execute def;
end $$;
