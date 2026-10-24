-- Los bots opinan de la música: cuando arranca un tema, alguno de los que están en la llamada
-- (o un fan de la música de la comunidad) comenta en el chat y, si está en la llamada, lo dice
-- en voz alta (voz del navegador). También reaccionan a los mensajes de Temazo.

alter table public.fogon_bot_queue add column if not exists say_voice uuid; -- además lo dice en esta llamada

insert into public.fogon_bot_lines (tag, body) values
  ('op_pos', 'uff temazo 🔥'),
  ('op_pos', 'qué buen tema, @{u} 👌'),
  ('op_pos', 'esto es justo lo que necesitaba'),
  ('op_pos', 'subile, subile 🔊'),
  ('op_pos', '{t}? temazo absoluto'),
  ('op_pos', 'me encanta esta 😍'),
  ('op_pos', 'clásico 🙌'),
  ('op_pos', 'esto me trae recuerdos 🥹'),
  ('op_pos', 'bien ahí @{u}, gran elección'),
  ('op_pos', 'esta la pongo en loop después'),
  ('op_neu', 'no la conocía, va'),
  ('op_neu', 'tranqui esta, me gusta para laburar'),
  ('op_neu', 'mmm a ver qué tal'),
  ('op_neu', 'buena para estudiar esta'),
  ('op_neu', 'zafa, zafa'),
  ('op_neg', 'esto no, pasala 😂 mentira, dale'),
  ('op_neg', '¿quién puso esto? jaja'),
  ('op_neg', '@{u} tenés gustos raros eh 😂'),
  ('op_neg', 'después pongo yo algo, aguanten');

create or replace function public.fogon_music_opinion(p_voice uuid, p_track jsonb, p_text_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  vc_text uuid := '465a45e0-5cb0-4ccb-ba92-fd9ccd873bca';
  v_bot uuid; v_in_call boolean := true; v_tag text; v_body text; r numeric := random();
begin
  if p_track is null or random() < 0.2 then return; end if; -- no siempre
  -- primero alguien que esté en la llamada; si no, un fan de la música
  select v.bot_id into v_bot from public.fogon_bot_voice v join public.fogon_profiles p on p.id = v.bot_id
  where v.channel_id = p_voice and v.afk_until is null and p.username not in ('temazo.dj', 'guardian', 'mica.cm', 'modmail', 'sofi')
  order by random() limit 1;
  if v_bot is null then
    v_in_call := false;
    select id into v_bot from public.fogon_profiles where username in ('ro.musica', 'camii', 'juli.memes', 'lucho.mate', 'valeee') order by random() limit 1;
  end if;
  if v_bot is null then return; end if;
  v_tag := case when r < 0.68 then 'op_pos' when r < 0.9 then 'op_neu' else 'op_neg' end;
  select replace(replace(body, '{t}', coalesce(p_track->>'title', 'esto')), '{u}', coalesce(p_track->>'by', 'alguien')) into v_body
  from public.fogon_bot_lines where tag = v_tag order by random() limit 1;
  insert into public.fogon_bot_queue (channel_id, bot_id, body, typing_at, send_at, say_voice)
  values (coalesce(p_text_channel, vc_text), v_bot, v_body,
          now() + make_interval(secs => 6 + random() * 14), now() + make_interval(secs => 9 + random() * 16),
          case when v_in_call then p_voice end);
end $$;
revoke execute on function public.fogon_music_opinion(uuid, jsonb, uuid) from public, anon, authenticated;

-- se engancha cuando arranca un tema (al pedirlo con la cola vacía, o al pasar al siguiente)
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_music_add'::regproc);
  def := replace(def, '    perform public.fogon_music_say(p_text_channel, ''🎵 Suena **''',
                      '    perform public.fogon_music_opinion(p_channel, t, p_text_channel);
    perform public.fogon_music_say(p_text_channel, ''🎵 Suena **''');
  if position('fogon_music_opinion' in def) = 0 then raise exception 'no pude enganchar fogon_music_add'; end if;
  execute def;

  def := pg_get_functiondef('public.fogon_music_next'::regproc);
  def := replace(def, '  perform public.fogon_music_presence(p_channel);
end',
                      '  if nxt is not null then perform public.fogon_music_opinion(p_channel, nxt, p_text_channel); end if;
  perform public.fogon_music_presence(p_channel);
end');
  if position('fogon_music_opinion' in def) = 0 then raise exception 'no pude enganchar fogon_music_next'; end if;
  execute def;
end $$;

-- la cola: si el mensaje tiene say_voice, el bot también lo dice en la llamada
do $$
declare def text := pg_get_functiondef('public.fogon_bots_fast'::regproc);
begin
  def := replace(def, '      if q.close_ticket is not null then perform public.fogon_ticket_close(q.close_ticket, q.bot_id); end if;',
                      '      if q.close_ticket is not null then perform public.fogon_ticket_close(q.close_ticket, q.bot_id); end if;
      if q.say_voice is not null then
        perform realtime.send(jsonb_build_object(''bot_id'', q.bot_id, ''text'', q.body), ''bot_say'', ''fogon-voice:'' || q.say_voice, true);
      end if;');
  if position('say_voice' in def) = 0 then raise exception 'no pude enganchar fogon_bots_fast'; end if;
  execute def;
end $$;

-- reacciones de los bots a lo que anuncia Temazo
create or replace function public.fogon_music_reacts()
returns void language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  for m in select id from public.fogon_messages
    where author_id = '7c1d1f00-0000-4000-8000-00000000cf01' and (content like '🎵 Suena%' or content like '⏭️ Ahora%')
      and created_at > now() - interval '15 minutes'
  loop
    if random() < 0.3 and (select count(*) from public.fogon_reactions where message_id = m.id) < 4 then
      insert into public.fogon_reactions (message_id, user_id, emoji)
      select m.id, p.id, (array['🔥', '🎶', '😍', '🙌', '💃', '🕺', '🔊'])[1 + floor(random() * 7)::int]
      from public.fogon_profiles p
      where p.is_bot and p.username not in ('temazo.dj', 'sofi', 'modmail', 'guardian')
        and not exists (select 1 from public.fogon_reactions r where r.message_id = m.id and r.user_id = p.id)
      order by random() limit 1
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke execute on function public.fogon_music_reacts() from public, anon, authenticated;
select cron.schedule('fogon-musica-reacciones', '* * * * *', 'select public.fogon_music_reacts()');
