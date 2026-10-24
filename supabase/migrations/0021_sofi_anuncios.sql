-- Sofi publica en la comunidad cosas de su novio (@gonza) con frases típicas de novios.
-- Uno o dos por día, a veces en #anuncios; los bots reaccionan y alguno comenta.

insert into public.fogon_bot_lines (tag, body) values
  ('sofi_anuncio', 'Quiero que todos sepan que @gonza es el mejor novio del mundo 💕 y que es mío jaja'),
  ('sofi_anuncio', 'Hoy cumplimos un día más juntos y lo elegiría mil veces más ❤️ te amo @gonza'),
  ('sofi_anuncio', 'Gracias @gonza por hacer este lugar tan lindo 🔥 y por hacerme feliz todos los días 🥹'),
  ('sofi_anuncio', 'No sé ustedes, pero yo tengo al novio más lindo del fogón 😌💕'),
  ('sofi_anuncio', 'Mi persona favorita en todo el mundo: @gonza 💞'),
  ('sofi_anuncio', 'Si alguien ve a @gonza programando hasta tarde, mándenlo a dormir que mañana lo quiero descansado 😴❤️'),
  ('sofi_anuncio', 'Contigo hasta el fin del mundo, @gonza 🌍💕'),
  ('sofi_anuncio', 'Eres mi lugar seguro, mi casa y mi paz 🏡💕 te amo @gonza'),
  ('sofi_anuncio', 'Lo más lindo de mi día es cuando @gonza me escribe "buen día amor" ☀️🥰'),
  ('sofi_anuncio', 'Te elijo hoy, mañana y siempre @gonza 💍✨'),
  ('sofi_anuncio', 'Para que quede claro: @gonza ya tiene dueña 😏💕 (soy yo)'),
  ('sofi_anuncio', 'Orgullosa de mi novio que hizo todo Fogón solito 🥹🔥 @gonza sos un genio'),
  ('sofi_anuncio_oficial', '📣 **Comunicado oficial de la novia:** @gonza está de novio y muy feliz 💕 Gracias por su atención 😌'),
  ('sofi_anuncio_oficial', '📣 **Aviso importante:** hoy @gonza me dijo "te amo" 14 veces. Récord del mes 🏆💕'),
  ('sofi_anuncio_oficial', '📣 **Anuncio:** les presento al amor de mi vida, el creador de este fogón: @gonza ❤️🔥'),
  ('sofi_reacc', 'qué lindos 🥹'),
  ('sofi_reacc', 'ay nooo qué tiernos 💕'),
  ('sofi_reacc', 'la pareja del fogón 🔥'),
  ('sofi_reacc', 'yo también quiero un amor así 😭'),
  ('sofi_reacc', 'goals 😍'),
  ('sofi_reacc', 'jajaja @gonza estás en problemas, ahora tenés que estar a la altura');

create or replace function public.fogon_sofi_announce(p_force boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  sofi uuid := '7c1d1f00-0000-4000-8000-00000000cb01';
  general uuid := '0a06e7df-d375-5f45-8bbf-802ccfde99b6';
  anuncios uuid := '9b58a035-f39d-5f53-8822-696ae155f652';
  v_hour int := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_tag text; v_ch uuid; v_body text; v_count int; v_last timestamptz; v_fan uuid; v_send timestamptz;
begin
  if not p_force then
    if v_hour not between 11 and 23 then return; end if;
    select count(*), max(created_at) into v_count, v_last from public.fogon_messages
      where author_id = sofi and channel_id in (general, anuncios) and (created_at at time zone 'America/Argentina/Buenos_Aires')::date = v_today;
    if v_count >= 2 or (v_last is not null and v_last > now() - interval '4 hours') then return; end if;
    if exists (select 1 from public.fogon_bot_queue where bot_id = sofi and channel_id in (general, anuncios) and sent_at is null) then return; end if;
    if random() >= 0.0025 then return; end if;
  end if;

  if random() < 0.2 then v_tag := 'sofi_anuncio_oficial'; v_ch := anuncios; else v_tag := 'sofi_anuncio'; v_ch := general; end if;
  select l.body into v_body from public.fogon_bot_lines l where l.tag = v_tag
    and not exists (select 1 from (select content from public.fogon_messages where author_id = sofi and channel_id = v_ch order by created_at desc limit 8) r where r.content = l.body)
    order by random() limit 1;
  if v_body is null then select body into v_body from public.fogon_bot_lines where tag = v_tag order by random() limit 1; end if;

  perform public.fogon_bot_enqueue(v_ch, sofi, v_body, null, interval '1 second');
  select max(send_at) into v_send from public.fogon_bot_queue where bot_id = sofi and channel_id = v_ch and sent_at is null;

  -- algún bot comenta en #general (no en #anuncios) un ratito después
  if v_ch = general and random() < 0.7 then
    select id into v_fan from public.fogon_profiles where is_bot and username in ('camii', 'valeee', 'flor.dibuja', 'juli.memes', 'mica.cm', 'lucho.mate') order by random() limit 1;
    perform public.fogon_bot_enqueue(general, v_fan, (select body from public.fogon_bot_lines where tag = 'sofi_reacc' order by random() limit 1), null,
      (v_send - now()) + make_interval(secs => 20 + random() * 60));
  end if;
end $$;
revoke execute on function public.fogon_sofi_announce(boolean) from public, anon, authenticated;

-- corazones de los bots al mensaje de Sofi (cuando ya salió)
create or replace function public.fogon_sofi_hearts()
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select id from public.fogon_messages
    where author_id = '7c1d1f00-0000-4000-8000-00000000cb01'
      and channel_id in ('0a06e7df-d375-5f45-8bbf-802ccfde99b6', '9b58a035-f39d-5f53-8822-696ae155f652')
      and created_at > now() - interval '30 minutes'
  loop
    if random() < 0.35 and (select count(*) from public.fogon_reactions where message_id = m.id) < 6 then
      insert into public.fogon_reactions (message_id, user_id, emoji)
      select m.id, p.id, (array['❤️', '🥹', '💕', '😍', '🔥'])[1 + floor(random() * 5)::int]
      from public.fogon_profiles p
      where p.is_bot and p.username not in ('sofi', 'modmail', 'guardian')
        and not exists (select 1 from public.fogon_reactions r where r.message_id = m.id and r.user_id = p.id)
      order by random() limit 1
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public.fogon_sofi_hearts() from public, anon, authenticated;

select cron.schedule('fogon-sofi-anuncios', '* * * * *', 'select public.fogon_sofi_announce(); select public.fogon_sofi_hearts();');

-- el primero, al aplicar
select public.fogon_sofi_announce(true);
