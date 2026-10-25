-- Cuando el dueño (@gonza) entra a la sala donde está gonza.bot, o gonza.bot llega a la sala del dueño,
-- gonza.bot lo saluda en voz: "hola señor".
create or replace function public.fogon_voice_here(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := 'e7809edc-8559-4df6-8d2b-1fffc7a27719';
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  v_prev uuid;
begin
  if auth.uid() is null then return; end if;
  if p_channel is null then
    delete from public.fogon_voice_here where user_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.fogon_channels where id = p_channel and kind = 'voice') or not public.fogon_can_read(p_channel) then return; end if;
  select channel_id into v_prev from public.fogon_voice_here where user_id = auth.uid();
  insert into public.fogon_voice_here (user_id, channel_id, at) values (auth.uid(), p_channel, now())
  on conflict (user_id) do update set channel_id = excluded.channel_id, at = now();
  -- el dueño recién entra a esta sala y gonza.bot está ahí
  if auth.uid() = v_owner and v_prev is distinct from p_channel
     and exists (select 1 from public.fogon_bot_voice where bot_id = v_bot and channel_id = p_channel) then
    perform realtime.send(jsonb_build_object('bot_id', v_bot, 'text', 'hola señor'), 'bot_say', 'fogon-voice:' || p_channel, true);
  end if;
end $$;

-- gonza.bot llega a una sala donde ya está el dueño: "hola señor" en vez del saludo de siempre
do $$
declare def text := pg_get_functiondef('public.fogon_gonza_voice_tick'::regproc);
begin
  def := replace(def, '    if v_cur is null then
      select l.body into v_line from public.fogon_bot_dm_lines l where l.bot = ''gonza.bot'' and l.kind = ''vc_join'' order by random() limit 1;',
'    if exists (select 1 from public.fogon_voice_here where user_id = ''e7809edc-8559-4df6-8d2b-1fffc7a27719'' and channel_id = v_best) then
      perform realtime.send(jsonb_build_object(''bot_id'', v_bot, ''text'', ''hola señor''), ''bot_say'', ''fogon-voice:'' || v_best, true);
    elsif v_cur is null then
      select l.body into v_line from public.fogon_bot_dm_lines l where l.bot = ''gonza.bot'' and l.kind = ''vc_join'' order by random() limit 1;');
  if position('hola señor' in def) = 0 then raise exception 'no pude ajustar fogon_gonza_voice_tick'; end if;
  execute def;
end $$;
