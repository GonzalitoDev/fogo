-- Mica atiende los tickets de ModMail: contesta con tono profesional según el tema, pide los datos
-- que hacen falta, deja una nota interna para el staff, escala lo urgente y cierra cuando se resolvió.
-- Si alguien del staff (una persona) contesta en el ticket, Mica se corre.

alter table public.fogon_bot_queue add column if not exists relay_to uuid;      -- además se manda a este privado (como ModMail)
alter table public.fogon_bot_queue add column if not exists close_ticket int;   -- al mandarlo, cierra este ticket
alter table public.fogon_tickets add column if not exists topic text;

create table if not exists public.fogon_ticket_lines (id serial primary key, kind text not null, body text not null);
alter table public.fogon_ticket_lines enable row level security;
create table if not exists public.fogon_ticket_patterns (id serial primary key, kind text not null, pattern text not null, prio int not null);
alter table public.fogon_ticket_patterns enable row level security;

insert into public.fogon_ticket_patterns (kind, pattern, prio) values
  ('t_urgente', '(suicid|me quiero matar|matarme|hacerme da[nñ]o|no quiero vivir|me voy a matar|amenaz|me van a (matar|pegar)|peligro)', 0),
  ('t_cierre', '^\s*(gracias|muchas gracias|mil gracias|era eso|eso era todo|ya est[aá]|listo|solucionado|ya se arregl|ya lo solucion|ya pude|todo bien,? gracias)', 1),
  ('t_reporte', '(report|denunci|acos|molest|insult|spam|estaf|me (est[aá]|anda) (molestando|jodiendo)|toxic|hackea|me robaron)', 2),
  ('t_apelacion', '(ban(eo|eado|earon)?\M|silenci|sanci[oó]n|injust|apelar|apelaci[oó]n|me echaron|kick)', 2),
  ('t_cuenta', '(contrase[nñ]a|password|mi cuenta|correo|mail|email|cambiar (el )?usuario|nombre de usuario|no puedo entrar|iniciar sesi[oó]n)', 3),
  ('t_voz', '(voz|micr[oó]fono|no me escuchan|no escucho|eco|ruido|llamada)', 3),
  ('t_bug', '(bug|error|no anda|no funciona|se rompi|se colg|no carga|falla|se cierra)', 4),
  ('t_sugerencia', '(sugerencia|sugiero|idea|estar[ií]a bueno|podr[ií]an agregar|propongo|me gustar[ií]a que)', 4),
  ('t_rol', '(\mrol(es)?\M|moderador|ser (mod|staff|admin)|postular)', 5);

insert into public.fogon_ticket_lines (kind, body) values
  ('t_urgente', 'Hola {n}, gracias por escribirnos. Lo que contás es importante y lo estamos priorizando ahora mismo.' || chr(10) || chr(10) ||
    'Si estás en peligro o pensás en hacerte daño, por favor comunicate ya con el **135** (Centro de Asistencia al Suicida, gratis desde CABA y GBA) o al **(011) 5275-1135** desde todo el país, o con emergencias al **911**. No estás solo/a.' || chr(10) || chr(10) ||
    'Ya avisé al equipo y una persona del staff te va a escribir por acá.'),
  ('t_reporte', 'Hola {n}, gracias por contactar al equipo de moderación de la Comunidad de Fogón. Lamentamos que estés pasando por esto.' || chr(10) || chr(10) ||
    'Para poder revisarlo, ¿nos podrías indicar?' || chr(10) || '1. El @usuario de la persona' || chr(10) || '2. Dónde ocurrió (canal o mensaje privado)' || chr(10) || '3. Una captura o una descripción de lo que pasó' || chr(10) || chr(10) ||
    'Mientras tanto, podés bloquear a esa persona desde su perfil para que no te pueda escribir. Todo lo que nos cuentes acá es confidencial.'),
  ('t_apelacion', 'Hola {n}, gracias por escribirnos. Recibimos tu pedido de revisión.' || chr(10) || chr(10) ||
    'Vamos a revisar el registro de moderación y el contexto de la sanción. Si querés, contanos tu versión de lo que pasó; lo tenemos en cuenta.' || chr(10) || chr(10) ||
    'Te vamos a responder por este medio con la decisión dentro de las próximas 24 a 48 horas. Gracias por tu paciencia.'),
  ('t_cuenta', 'Hola {n}, gracias por escribirnos. Te ayudamos con tu cuenta.' || chr(10) || chr(10) ||
    '• Contraseña: engranaje ⚙️ → Mi cuenta → «Contraseña y autenticación».' || chr(10) || '• Nombre visible, foto y banner: engranaje ⚙️ → Perfiles.' || chr(10) || chr(10) ||
    'Importante: nadie del staff te va a pedir nunca tu contraseña. Si el problema es otro, contanos con más detalle qué está pasando.'),
  ('t_voz', 'Hola {n}, gracias por escribirnos. Vamos a resolver el problema de voz.' || chr(10) || chr(10) ||
    '1. Revisá que el navegador tenga permiso para el micrófono (el candado de la barra de direcciones).' || chr(10) ||
    '2. En engranaje ⚙️ → Voz, probá con «Probemos» si se mueve la barra de nivel.' || chr(10) ||
    '3. Si hay eco o ruido, usá auriculares y dejá la supresión en «IA (RNNoise)».' || chr(10) || chr(10) ||
    'Si sigue sin andar, decinos qué dispositivo y navegador usás y lo pasamos al equipo técnico.'),
  ('t_bug', 'Hola {n}, gracias por reportarlo. Para que el equipo lo pueda reproducir, ¿nos contás?' || chr(10) || chr(10) ||
    '1. Qué estabas haciendo cuando pasó' || chr(10) || '2. Qué esperabas que pasara y qué pasó' || chr(10) || '3. Desde qué dispositivo y navegador' || chr(10) || chr(10) ||
    'Si se confirma, te damos la insignia de Cazabugs 🐛. ¡Gracias por ayudarnos a mejorar Fogón!'),
  ('t_sugerencia', 'Hola {n}, ¡muchas gracias por la sugerencia! Quedó registrada y se la pasamos al equipo que desarrolla Fogón.' || chr(10) || chr(10) ||
    'Si querés sumar más detalle (cómo te imaginás que funcione, para qué lo usarías), escribilo por acá y lo agregamos al ticket.'),
  ('t_rol', 'Hola {n}, gracias por tu interés en sumar al equipo. Los roles de Moderación los asigna la administración a miembros activos y con buena conducta en la comunidad.' || chr(10) || chr(10) ||
    'Si querés postularte, contanos brevemente por qué te gustaría y cuánto tiempo le podrías dedicar. Lo evaluamos y te respondemos por este medio.'),
  ('t_general', 'Hola {n}, gracias por comunicarte con el staff de la Comunidad de Fogón. Soy Mica, community manager.' || chr(10) || chr(10) ||
    'Recibimos tu consulta y quedó registrada en el ticket. ¿Nos podrías dar un poco más de detalle para poder ayudarte mejor?'),
  ('t_info', 'Gracias por la información, {n}. Quedó registrada en el ticket y el equipo la está revisando. Te avisamos por este medio apenas tengamos novedades.'),
  ('t_info', 'Perfecto, {n}, gracias. Ya lo sumamos al ticket. Si tenés algo más para agregar, podés escribirlo por acá.'),
  ('t_info', 'Recibido, {n}. Lo estamos revisando con el equipo de moderación; en cuanto tengamos una respuesta te escribimos.'),
  ('t_cierre', 'Me alegra haber podido ayudarte, {n}. Doy por cerrado el ticket. Si necesitás algo más, escribinos nuevamente cuando quieras. ¡Que tengas un buen día!'),
  ('t_cierre', '¡De nada, {n}! Cierro el ticket entonces. Cualquier otra cosa, estamos a un mensaje de distancia. 🙌');

insert into public.fogon_ticket_lines (kind, body) values
  ('n_t_urgente', '⚠️ **Nota interna (Mica):** ticket **prioritario** — posible situación de riesgo. @gonza por favor tomalo personalmente.'),
  ('n_t_reporte', '📋 **Nota interna (Mica):** clasificado como **reporte**. Le pedí @ de la persona, lugar y evidencia.'),
  ('n_t_apelacion', '📋 **Nota interna (Mica):** **apelación** de sanción. Revisen #registro-mod antes de decidir. Le prometí respuesta en 24–48 h.'),
  ('n_t_cuenta', '📋 **Nota interna (Mica):** consulta de **cuenta**. Le pasé los pasos básicos.'),
  ('n_t_voz', '📋 **Nota interna (Mica):** problema de **voz**. Le pasé los pasos de diagnóstico.'),
  ('n_t_bug', '📋 **Nota interna (Mica):** posible **bug**. Le pedí pasos, dispositivo y navegador.'),
  ('n_t_sugerencia', '📋 **Nota interna (Mica):** **sugerencia** para el equipo.'),
  ('n_t_rol', '📋 **Nota interna (Mica):** pedido de **rol de staff**. Le pedí motivación y disponibilidad.'),
  ('n_t_general', '📋 **Nota interna (Mica):** consulta **general**. Le pedí más detalle.');

-- cierra un ticket (lo usan Mica y el comando !cerrar)
create or replace function public.fogon_ticket_close(p_ticket int, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mm uuid := '7c1d1f00-0000-4000-8000-00000000cd01';
  tk public.fogon_tickets; v_name text;
begin
  select * into tk from public.fogon_tickets where id = p_ticket;
  if not found or tk.status = 'closed' then return; end if;
  select display_name into v_name from public.fogon_profiles where id = p_by;
  update public.fogon_tickets set status = 'closed', closed_at = now(), closed_by = p_by where id = tk.id;
  update public.fogon_channels set name = 'cerrado-' || lpad(tk.id::text, 4, '0') || coalesce(substring(name from '^ticket-\d+(-.*)$'), '') where id = tk.channel_id;
  insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm, '🔒 Ticket cerrado por **' || coalesce(v_name, 'el staff') || '**.');
  insert into public.fogon_messages (channel_id, author_id, content) values (tk.dm_channel_id, mm,
    '🔒 Tu ticket **#' || lpad(tk.id::text, 4, '0') || '** quedó cerrado. ¡Gracias por escribir! Si necesitás algo más, mandame otro mensaje y abro uno nuevo.');
end $$;

-- Mica contesta en el ticket (y le llega al usuario por privado)
create or replace function public.fogon_mica_ticket(p_ticket int, p_content text, p_first boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mica uuid := '7c1d1f00-0000-4000-8000-00000000ca01';
  tk public.fogon_tickets; v_kind text; v_body text; v_note text; v_name text; v_wait interval;
begin
  select * into tk from public.fogon_tickets where id = p_ticket;
  if not found or tk.status <> 'open' then return; end if;
  -- si ya contestó una persona del staff, Mica no se mete
  if exists (select 1 from public.fogon_messages m join public.fogon_profiles p on p.id = m.author_id and not p.is_bot
             where m.channel_id = tk.channel_id and m.content !~* '^\s*(!nota|=)') then return; end if;

  select display_name into v_name from public.fogon_profiles where id = tk.user_id;
  select kind into v_kind from public.fogon_ticket_patterns where p_content ~* pattern order by prio limit 1;

  if p_first then
    if v_kind is null or v_kind = 't_cierre' then v_kind := 't_general'; end if;
    update public.fogon_tickets set topic = v_kind where id = tk.id;
  elsif v_kind = 't_urgente' and tk.topic is distinct from 't_urgente' then
    update public.fogon_tickets set topic = v_kind where id = tk.id;
  elsif v_kind = 't_cierre' then
    null;
  else
    v_kind := 't_info';
  end if;

  select replace(body, '{n}', coalesce(v_name, '')) into v_body from public.fogon_ticket_lines where kind = v_kind
    and not exists (select 1 from (select content from public.fogon_messages where channel_id = tk.channel_id and author_id = mica order by created_at desc limit 6) r
                    where r.content = replace(body, '{n}', coalesce(v_name, '')))
    order by random() limit 1;
  if v_body is null then select replace(body, '{n}', coalesce(v_name, '')) into v_body from public.fogon_ticket_lines where kind = v_kind order by random() limit 1; end if;

  -- si escribe varias veces seguidas, contesta una vez
  update public.fogon_bot_queue set sent_at = now() where channel_id = tk.channel_id and bot_id = mica and sent_at is null and typed_at is null and relay_to is not null;

  v_wait := make_interval(secs => case when p_first then 6 + random() * 6 else 4 + random() * 5 end);
  insert into public.fogon_bot_queue (channel_id, bot_id, body, reply_to, typing_at, send_at, relay_to, close_ticket)
  values (tk.channel_id, mica, v_body, null, now() + v_wait,
          now() + v_wait + make_interval(secs => least(10, 2 + length(v_body) / 40.0)),
          tk.dm_channel_id, case when v_kind = 't_cierre' then tk.id end);

  -- nota interna para el staff (no le llega al usuario)
  if p_first or v_kind = 't_urgente' then
    select body into v_note from public.fogon_ticket_lines where kind = 'n_' || v_kind limit 1;
    if v_note is not null then
      insert into public.fogon_bot_queue (channel_id, bot_id, body, typing_at, send_at)
      values (tk.channel_id, mica, v_note, now() + interval '1 second', now() + interval '2 seconds');
    end if;
  end if;
end $$;

-- ModMail: después de pasar el mensaje al ticket, le avisa a Mica; y !cerrar usa la función nueva
do $$
declare def text := pg_get_functiondef('public.fogon_modmail'::regproc);
begin
  def := replace(def, 'insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm,
      ''💬 **'' || v_name || '':** '' || p_msg.content || v_files);
    return true;',
  'insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm,
      ''💬 **'' || v_name || '':** '' || p_msg.content || v_files);
    perform public.fogon_mica_ticket(tk.id, p_msg.content, not exists (select 1 from public.fogon_messages where channel_id = tk.channel_id and author_id = ''7c1d1f00-0000-4000-8000-00000000ca01'') and not exists (select 1 from public.fogon_bot_queue where channel_id = tk.channel_id and bot_id = ''7c1d1f00-0000-4000-8000-00000000ca01''));
    return true;');
  if position('fogon_mica_ticket' in def) = 0 then raise exception 'no encontré dónde enganchar a Mica en fogon_modmail'; end if;
  execute def;
end $$;

-- la cola: si el mensaje tiene relay_to, también se manda al privado como ModMail (firmado por Mica); y puede cerrar el ticket
create or replace function public.fogon_bots_fast()
returns void language plpgsql security definer set search_path = '' as $$
declare
  q record;
  mm uuid := '7c1d1f00-0000-4000-8000-00000000cd01';
begin
  for q in select * from public.fogon_bot_queue where sent_at is null and typing_at <= now() and send_at > now() and (typed_at is null or typed_at < now() - interval '4 seconds') loop
    begin
      perform realtime.send(jsonb_build_object('user_id', q.bot_id), 'typing', 'typing:' || q.channel_id, false);
      if q.relay_to is not null then perform realtime.send(jsonb_build_object('user_id', mm), 'typing', 'typing:' || q.relay_to, false); end if;
    exception when others then null;
    end;
    update public.fogon_bot_queue set typed_at = now() where id = q.id;
  end loop;

  for q in select * from public.fogon_bot_queue where sent_at is null and send_at <= now() and send_at > now() - interval '10 minutes' order by send_at limit 30 loop
    update public.fogon_bot_queue set sent_at = now() where id = q.id;
    begin
      insert into public.fogon_messages (channel_id, author_id, content, reply_to_id) values (q.channel_id, q.bot_id, q.body, q.reply_to);
      perform realtime.send(jsonb_build_object('user_id', q.bot_id, 'stop', true), 'typing', 'typing:' || q.channel_id, false);
      if q.relay_to is not null then
        insert into public.fogon_messages (channel_id, author_id, content) values (q.relay_to, mm, '🛡️ **Staff · Mica (Community Manager):** ' || q.body);
        perform realtime.send(jsonb_build_object('user_id', mm, 'stop', true), 'typing', 'typing:' || q.relay_to, false);
      end if;
      if q.close_ticket is not null then perform public.fogon_ticket_close(q.close_ticket, q.bot_id); end if;
    exception when others then null;
    end;
  end loop;
end $$;

revoke execute on function public.fogon_ticket_close(int, uuid) from public, anon, authenticated;
revoke execute on function public.fogon_mica_ticket(int, text, boolean) from public, anon, authenticated;
revoke execute on function public.fogon_bots_fast() from public, anon, authenticated;
