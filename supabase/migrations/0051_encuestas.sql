-- Encuestas en los mensajes (como Discord): una pregunta, hasta 10 respuestas, una o varias opciones,
-- y una duración. Se votan en el mensaje y los resultados se ven en vivo.

create table if not exists public.fogon_message_polls (
  message_id uuid primary key references public.fogon_messages (id) on delete cascade,
  channel_id uuid not null references public.fogon_channels (id) on delete cascade,
  question text not null check (length(question) between 1 and 300),
  options jsonb not null, -- [{ "id": 1, "text": "...", "emoji": "🔥" }]
  multi boolean not null default false,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists fogon_message_polls_channel on public.fogon_message_polls (channel_id);

create table if not exists public.fogon_poll_votes (
  message_id uuid not null references public.fogon_messages (id) on delete cascade,
  user_id uuid not null references public.fogon_profiles (id) on delete cascade,
  option_id smallint not null,
  at timestamptz not null default now(),
  primary key (message_id, user_id, option_id)
);

alter table public.fogon_message_polls enable row level security;
alter table public.fogon_poll_votes enable row level security;
revoke all on public.fogon_message_polls, public.fogon_poll_votes from anon, authenticated;
grant select on public.fogon_message_polls, public.fogon_poll_votes to authenticated;
create policy fogon_message_polls_select on public.fogon_message_polls for select to authenticated using (public.fogon_can_read(channel_id));
create policy fogon_poll_votes_select on public.fogon_poll_votes for select to authenticated
  using (exists (select 1 from public.fogon_message_polls p where p.message_id = fogon_poll_votes.message_id and public.fogon_can_read(p.channel_id)));

do $$ begin
  alter publication supabase_realtime add table public.fogon_message_polls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.fogon_poll_votes;
exception when duplicate_object then null; end $$;

create or replace function public.fogon_create_poll(p_channel uuid, p_question text, p_options jsonb, p_multi boolean, p_hours integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); c record; v_id uuid := gen_random_uuid(); v_opts jsonb := '[]'; o jsonb; i integer := 0; v_q text := btrim(coalesce(p_question, ''));
begin
  if me is null then raise exception 'Tenés que iniciar sesión.'; end if;
  select id, kind, server_id into c from public.fogon_channels where id = p_channel;
  if c.id is null or c.kind not in ('text', 'dm', 'thread') then raise exception 'Ese canal no admite encuestas.'; end if;
  if not public.fogon_can_read(p_channel) or not public.fogon_channel_allows(p_channel, 'send_messages') then raise exception 'No podés escribir en este canal.'; end if;
  if c.server_id is not null and not public.fogon_channel_allows(p_channel, 'create_polls') then raise exception 'No tenés permiso para crear encuestas acá.'; end if;
  if length(v_q) = 0 or length(v_q) > 300 then raise exception 'La pregunta tiene que tener entre 1 y 300 letras.'; end if;
  if jsonb_typeof(p_options) <> 'array' then raise exception 'Faltan las respuestas.'; end if;
  for o in select * from jsonb_array_elements(p_options) loop
    if length(btrim(coalesce(o ->> 'text', ''))) = 0 then continue; end if;
    i := i + 1;
    v_opts := v_opts || jsonb_build_array(jsonb_build_object('id', i, 'text', left(btrim(o ->> 'text'), 55), 'emoji', nullif(left(btrim(coalesce(o ->> 'emoji', '')), 64), '')));
  end loop;
  if i < 2 then raise exception 'Poné al menos 2 respuestas.'; end if;
  if i > 10 then raise exception 'Como mucho 10 respuestas.'; end if;
  if coalesce(p_hours, 0) not in (1, 4, 8, 24, 72, 168, 336) then raise exception 'Duración no válida.'; end if;

  insert into public.fogon_messages (id, channel_id, author_id, content) values (v_id, p_channel, me, '📊 ' || v_q);
  insert into public.fogon_message_polls (message_id, channel_id, question, options, multi, ends_at)
  values (v_id, p_channel, v_q, v_opts, coalesce(p_multi, false), now() + make_interval(hours => p_hours));
  return v_id;
end $$;
revoke execute on function public.fogon_create_poll(uuid, text, jsonb, boolean, integer) from public, anon;
grant execute on function public.fogon_create_poll(uuid, text, jsonb, boolean, integer) to authenticated;

-- votar: manda todas tus opciones (vacío = sacar el voto)
create or replace function public.fogon_poll_vote(p_message uuid, p_options smallint[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); p record; srv uuid; n integer := coalesce(array_length(p_options, 1), 0);
begin
  if me is null then raise exception 'Tenés que iniciar sesión.'; end if;
  select * into p from public.fogon_message_polls where message_id = p_message;
  if p.message_id is null or not public.fogon_can_read(p.channel_id) then raise exception 'Esa encuesta no existe.'; end if;
  if p.ends_at <= now() then raise exception 'La encuesta ya terminó.'; end if;
  select server_id into srv from public.fogon_channels where id = p.channel_id;
  if srv is not null and exists (select 1 from public.fogon_timeouts t where t.server_id = srv and t.user_id = me and t.until > now()) then
    raise exception 'Estás aislado: no podés votar por ahora.';
  end if;
  if n > 1 and not p.multi then raise exception 'En esta encuesta se elige una sola respuesta.'; end if;
  if exists (select 1 from unnest(p_options) x where x < 1 or x > jsonb_array_length(p.options)) then raise exception 'Esa respuesta no existe.'; end if;
  delete from public.fogon_poll_votes where message_id = p_message and user_id = me and not (option_id = any(coalesce(p_options, '{}')));
  insert into public.fogon_poll_votes (message_id, user_id, option_id) select p_message, me, x from unnest(p_options) x on conflict do nothing;
end $$;
revoke execute on function public.fogon_poll_vote(uuid, smallint[]) from public, anon;
grant execute on function public.fogon_poll_vote(uuid, smallint[]) to authenticated;

-- terminar antes de tiempo: quien la hizo o quien administra mensajes
create or replace function public.fogon_poll_end(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p record; m record; srv uuid;
begin
  select * into p from public.fogon_message_polls where message_id = p_message;
  select author_id into m from public.fogon_messages where id = p_message;
  if p.message_id is null then raise exception 'Esa encuesta no existe.'; end if;
  select server_id into srv from public.fogon_channels where id = p.channel_id;
  if m.author_id <> auth.uid() and not (srv is not null and public.fogon_has_perm(srv, 'manage_messages')) then
    raise exception 'Solo quien hizo la encuesta puede terminarla.';
  end if;
  update public.fogon_message_polls set ends_at = least(ends_at, now()) where message_id = p_message;
end $$;
revoke execute on function public.fogon_poll_end(uuid) from public, anon;
grant execute on function public.fogon_poll_end(uuid) to authenticated;
