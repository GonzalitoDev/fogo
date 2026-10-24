-- Comunidad de Fogón: el Guardián modera solo (AutoMod), un bot de ModMail para tickets con el staff,
-- y los bots pasan más tiempo en el canal de voz Fogón.

/* ---------- categoría STAFF (privada): registro de moderación y tickets ---------- */

insert into public.fogon_channels (id, server_id, kind, name, position) values
  ('7c1d1f00-0000-4000-8000-00000000cc01', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'category', 'STAFF', 5)
on conflict (id) do nothing;
insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values
  ('7c1d1f00-0000-4000-8000-00000000cc02', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', 'registro-mod', 'Lo que hace el Guardián: mensajes bloqueados y silencios', '7c1d1f00-0000-4000-8000-00000000cc01', 0)
on conflict (id) do nothing;

-- nadie la ve salvo el staff (el dueño y quien administra canales la ven siempre)
insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc01', null, '{}', array['view_channel']),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc01', 'cd2a1041-5663-5e79-a94f-e6fd2978b54b', array['view_channel', 'send_messages'], '{}'),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc01', '7c1d1f00-0000-4000-8000-00000000ca02', array['view_channel', 'send_messages'], '{}'),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc01', '19d2e5fa-e065-4adb-b2a6-17ba237dc45f', array['view_channel', 'send_messages'], '{}'),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc01', '823eebfe-0bf5-4492-ab22-cb0b83c07555', array['view_channel', 'send_messages'], '{}')
on conflict do nothing;
-- en el registro solo escriben los bots
insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny) values
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc02', null, '{}', array['send_messages'])
on conflict do nothing;

/* ---------- AutoMod del Guardián ---------- */

create table if not exists public.fogon_automod_log (
  id bigserial primary key,
  server_id uuid not null,
  user_id uuid not null,
  channel_id uuid,
  reason text not null,
  content text,
  at timestamptz not null default now()
);
create index if not exists fogon_automod_log_user on public.fogon_automod_log (user_id, at desc);
alter table public.fogon_automod_log enable row level security;

create table if not exists public.fogon_timeouts (
  server_id uuid not null,
  user_id uuid not null,
  until timestamptz not null,
  reason text,
  primary key (server_id, user_id)
);
alter table public.fogon_timeouts enable row level security;

-- ¿esta persona es del staff? (dueño, o algún rol que pueda moderar mensajes / el servidor)
create or replace function public.fogon_is_staff(p_server uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_servers s where s.id = p_server and s.owner_id = p_user)
      or exists (select 1 from public.fogon_member_roles mr join public.fogon_roles r on r.id = mr.role_id
                 where mr.server_id = p_server and mr.user_id = p_user
                   and r.perms && array['manage_messages', 'manage_server', 'kick_members', 'ban_members']);
$$;

create or replace function public.fogon_automod()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  guardian uuid := '5b562d7b-f31b-5b40-b5f1-d36a0d8d1d2a';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  v_log uuid := '7c1d1f00-0000-4000-8000-00000000cc02';
  ch public.fogon_channels; t record; v_reason text; v_strikes int; v_user text; v_until timestamptz;
begin
  select * into ch from public.fogon_channels where id = new.channel_id;
  if ch.server_id is distinct from community then return new; end if;
  if exists (select 1 from public.fogon_profiles where id = new.author_id and is_bot) then return new; end if;
  if public.fogon_is_staff(community, new.author_id) then return new; end if;
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return new; end if;

  -- silenciado: no puede escribir hasta que se le pase
  select * into t from public.fogon_timeouts where server_id = community and user_id = new.author_id and until > now();
  if found then
    raise exception 'El Guardián te silenció hasta las % (%). Mientras tanto podés leer.',
      to_char(t.until at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), coalesce(t.reason, 'moderación') using errcode = '42501';
  end if;

  if new.content ~* '(\mhdp\M|hij[oa] de (re )?puta|la concha de tu|conchud[oa]|pelotud[oa]|\mforr[oa]s?\M|mog[oó]lic[oa]|retrasad[oa]|\msorete|\mput[oa]s?\M|maric[oó]n|\mtrol[oa]s?\M|negr[oa]s? de mierda|\mkys\M|matate|suicidate|and[aá] a morirte)' then
    v_reason := 'insultos';
  elsif tg_op = 'INSERT' and (select count(*) from public.fogon_messages m where m.channel_id = new.channel_id and m.author_id = new.author_id and m.created_at > now() - interval '8 seconds') >= 4 then
    v_reason := 'flood (muchos mensajes seguidos)';
  elsif tg_op = 'INSERT' and length(new.content) >= 3 and (select count(*) from public.fogon_messages m where m.author_id = new.author_id and m.content = new.content and m.created_at > now() - interval '2 minutes') >= 2 then
    v_reason := 'spam (mismo mensaje repetido)';
  elsif (select count(*) from regexp_matches(new.content, '(^|\s)@[a-z0-9_.]+', 'g')) >= 5 then
    v_reason := 'menciones masivas';
  elsif new.content !~ '[a-záéíóúñ]' and length(regexp_replace(new.content, '[^A-ZÁÉÍÓÚÑ]', '', 'g')) >= 20 then
    v_reason := 'todo en mayúsculas';
  end if;
  if v_reason is null then return new; end if;

  -- no se borra: queda tapado, como el AutoMod de Discord
  insert into public.fogon_automod_log (server_id, user_id, channel_id, reason, content) values (community, new.author_id, new.channel_id, v_reason, left(new.content, 500));
  new.content := '🛡️ *Mensaje bloqueado por el Guardián (' || v_reason || ').*';
  new.attachments := '[]'::jsonb;

  select username into v_user from public.fogon_profiles where id = new.author_id;
  select count(*) into v_strikes from public.fogon_automod_log where server_id = community and user_id = new.author_id and at > now() - interval '15 minutes';

  if v_strikes >= 3 then
    v_until := now() + case when v_strikes >= 5 then interval '30 minutes' else interval '5 minutes' end;
    insert into public.fogon_timeouts (server_id, user_id, until, reason) values (community, new.author_id, v_until, v_reason)
    on conflict (server_id, user_id) do update set until = excluded.until, reason = excluded.reason;
    perform public.fogon_bot_enqueue(new.channel_id, guardian, '@' || v_user || ' te silencié ' || case when v_strikes >= 5 then '30' else '5' end || ' minutos por ' || v_reason || '. Leé #bienvenida 🛡️', null, interval '1 second');
    perform public.fogon_bot_enqueue(v_log, guardian, '⏳ **@' || v_user || '** silenciado hasta las ' || to_char(v_until at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') || ' — ' || v_strikes || ' avisos en 15 min (último: ' || v_reason || ', en #' || ch.name || ')', null, interval '1 second');
  else
    perform public.fogon_bot_enqueue(new.channel_id, guardian, '@' || v_user || ' ojo: ' || v_reason || ' no va acá 🛡️ (aviso ' || v_strikes || '/3)', null, interval '1 second');
    perform public.fogon_bot_enqueue(v_log, guardian, '🛡️ Bloqueé un mensaje de **@' || v_user || '** en #' || ch.name || ' — ' || v_reason || ' (aviso ' || v_strikes || '/3)' || chr(10) || '> ' || replace(left((select content from public.fogon_automod_log where user_id = new.author_id order by id desc limit 1), 200), chr(10), ' '), null, interval '1 second');
  end if;
  return new;
end $$;
revoke execute on function public.fogon_automod() from public, anon, authenticated;
create or replace trigger fogon_automod before insert or update of content on public.fogon_messages for each row execute function public.fogon_automod();

/* ---------- ModMail ---------- */

insert into public.fogon_profiles (id, username, display_name, color, pronouns, custom_status, bio, status, is_bot, created_at) values
  ('7c1d1f00-0000-4000-8000-00000000cd01', 'modmail', 'ModMail', '#5865f2', '', '📬 Escribime para hablar con el staff',
   'Mandame un mensaje privado y abro un ticket con el staff de la Comunidad de Fogón.' || chr(10) || 'Todo lo que escribas acá les llega a ellos, y sus respuestas te llegan por acá.',
   'online', true, '2026-10-22 18:00:00+00')
on conflict (id) do nothing;
insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cd01', '2026-10-22 18:00:00+00') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cd01', 'cc8fa08b-3b00-5e70-8236-f294b228b80d') on conflict do nothing;

create table if not exists public.fogon_tickets (
  id serial primary key,
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  dm_channel_id uuid not null,
  channel_id uuid references public.fogon_channels(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid
);
create index if not exists fogon_tickets_open on public.fogon_tickets (user_id) where status = 'open';
alter table public.fogon_tickets enable row level security;

-- lo que pasa cuando alguien le escribe al ModMail, o cuando el staff contesta en el canal del ticket
create or replace function public.fogon_modmail(p_msg public.fogon_messages, p_is_dm boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  mm uuid := '7c1d1f00-0000-4000-8000-00000000cd01';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  staff_cat uuid := '7c1d1f00-0000-4000-8000-00000000cc01';
  tk public.fogon_tickets; v_user text; v_name text; v_cid uuid; v_text text; v_files text := '';
begin
  if jsonb_array_length(coalesce(p_msg.attachments, '[]'::jsonb)) > 0 then v_files := chr(10) || '📎 *(adjuntó ' || jsonb_array_length(p_msg.attachments) || ' archivo/s)*'; end if;

  if p_is_dm then
    if not exists (select 1 from public.fogon_dm_participants where channel_id = p_msg.channel_id and user_id = mm) then return false; end if;
    select username, display_name into v_user, v_name from public.fogon_profiles where id = p_msg.author_id;
    select * into tk from public.fogon_tickets where user_id = p_msg.author_id and status = 'open' order by id desc limit 1;
    if not found then
      -- ticket nuevo: canal privado dentro de STAFF
      insert into public.fogon_tickets (user_id, dm_channel_id) values (p_msg.author_id, p_msg.channel_id) returning * into tk;
      insert into public.fogon_channels (server_id, kind, name, topic, parent_id, position)
      values (community, 'text', 'ticket-' || lpad(tk.id::text, 4, '0') || '-' || left(v_user, 20),
              'Ticket de @' || v_user || '. Lo que escriban acá le llega por privado. «!nota …» no se manda. «!cerrar» lo cierra.', staff_cat, 10 + tk.id)
      returning id into v_cid;
      update public.fogon_tickets set channel_id = v_cid where id = tk.id;
      tk.channel_id := v_cid;
      insert into public.fogon_messages (channel_id, author_id, content) values (v_cid, mm,
        '📬 **Ticket #' || lpad(tk.id::text, 4, '0') || '** abierto por **' || v_name || '** (@' || v_user || ')' || chr(10) ||
        'Contesten acá y le llega por privado. `!nota texto` para notas internas, `!cerrar` para cerrarlo.');
      insert into public.fogon_messages (channel_id, author_id, content) values (p_msg.channel_id, mm,
        '✅ Abrí tu ticket **#' || lpad(tk.id::text, 4, '0') || '**. Ya le llegó al staff y te van a contestar por acá. Podés seguir escribiendo todo lo que quieras agregar.');
    end if;
    insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm,
      '💬 **' || v_name || ':** ' || p_msg.content || v_files);
    return true;
  end if;

  -- mensaje del staff en el canal de un ticket
  select * into tk from public.fogon_tickets where channel_id = p_msg.channel_id order by id desc limit 1;
  if not found then return false; end if;
  v_text := trim(p_msg.content);
  if v_text ~* '^!nota\M' or left(v_text, 1) = '=' then return true; end if;
  select display_name into v_name from public.fogon_profiles where id = p_msg.author_id;
  if v_text ~* '^!cerrar\M' then
    if tk.status = 'closed' then return true; end if;
    update public.fogon_tickets set status = 'closed', closed_at = now(), closed_by = p_msg.author_id where id = tk.id;
    update public.fogon_channels set name = 'cerrado-' || lpad(tk.id::text, 4, '0') || coalesce(substring(name from '^ticket-\d+(-.*)$'), '') where id = tk.channel_id;
    insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm, '🔒 Ticket cerrado por **' || v_name || '**.');
    insert into public.fogon_messages (channel_id, author_id, content) values (tk.dm_channel_id, mm,
      '🔒 El staff cerró tu ticket **#' || lpad(tk.id::text, 4, '0') || '**. ¡Gracias por escribir! Si necesitás algo más, mandame otro mensaje y abro uno nuevo.');
    return true;
  end if;
  if tk.status = 'closed' then
    insert into public.fogon_messages (channel_id, author_id, content) values (tk.channel_id, mm, '⚠️ Este ticket está cerrado: no le mandé ese mensaje.');
    return true;
  end if;
  insert into public.fogon_messages (channel_id, author_id, content) values (tk.dm_channel_id, mm, '🛡️ **Staff · ' || v_name || ':** ' || p_msg.content || v_files);
  return true;
end $$;
revoke execute on function public.fogon_modmail(public.fogon_messages, boolean) from public, anon, authenticated;

-- se engancha al trigger de mensajes: primero ModMail, después lo de siempre
do $$
declare def text := pg_get_functiondef('public.fogon_bot_on_message'::regproc);
begin
  def := replace(def, '  select * into ch from public.fogon_channels where id = new.channel_id;
',
'  select * into ch from public.fogon_channels where id = new.channel_id;
  if public.fogon_modmail(new, ch.kind = ''dm'') then return null; end if;
');
  execute def;
end $$;

-- Mica y el Guardián avisan que existe
update public.fogon_bot_dm_lines set body = body || chr(10) || 'También podés escribirle a @modmail y abrís un ticket directo con el staff 📬'
where bot = 'mica.cm' and kind = 'h_reportar' and body not like '%modmail%';
insert into public.fogon_bot_dm_patterns (bot, kind, pattern, prio) values
  ('mica.cm', 'h_ticket', '(ticket|modmail|hablar con (el )?staff|contactar|soporte)', 0);
insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('mica.cm', 'h_ticket', 'Para hablar con el staff mandale un privado a @modmail 📬 Abre un ticket y te contestan por ahí mismo.');
insert into public.fogon_bot_lines (tag, body) values
  ('cm_anuncio', '📣 Nuevo: **@modmail** 📬 Si necesitás hablar con el staff (reportar algo, una duda, una idea), mandale un privado y se abre un ticket.'),
  ('cm_anuncio', '📣 El **Guardián** 🛡️ ahora modera solo: insultos, spam y flood quedan tapados, y a los 3 avisos te silencia un rato. ¡Buena onda siempre!');

/* ---------- los bots también pasan por el canal de voz Fogón ---------- */

do $$
declare def text := pg_get_functiondef('public.fogon_bots_voice_tick'::regproc);
begin
  def := replace(def, 'want_f := case when v_hour in (20, 21, 22, 23) then 2 when v_hour in (13, 18, 19, 0) then 1 else 0 end;',
                      'want_f := case when v_hour in (20, 21, 22, 23) then 3 when v_hour between 12 and 19 or v_hour in (0, 1) then 2 when v_hour between 9 and 11 then 1 else 0 end;');
  def := replace(def, 'where p.username in (''ro.musica'', ''camii'', ''flor.dibuja'', ''abucoco'', ''lucho.mate'')',
                      'where p.username in (''ro.musica'', ''camii'', ''flor.dibuja'', ''abucoco'', ''lucho.mate'', ''valeee'', ''nacho.dev'', ''juli.memes'', ''santi_futbol'')');
  execute def;
end $$;

/* ---------- ModMail no charla ni juega: solo hace tickets ---------- */

do $$
declare f text; def text;
begin
  foreach f in array array['public.fogon_bots_tick', 'public.fogon_bots_social', 'public.fogon_community_welcome', 'public.fogon_bot_on_message'] loop
    def := pg_get_functiondef(f::regproc);
    def := replace(def, '''guardian'', ''mica.cm'', ''sofi'')', '''guardian'', ''mica.cm'', ''sofi'', ''modmail'')');
    def := replace(def, 'username <> ''sofi''', 'username not in (''sofi'', ''modmail'')');
    def := replace(def, 'username not in (''guardian'', ''sofi'')', 'username not in (''guardian'', ''sofi'', ''modmail'')');
    execute def;
  end loop;
end $$;
