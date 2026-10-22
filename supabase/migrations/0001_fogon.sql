-- Fogón: chat estilo Discord. Todo con prefijo fogon_ para convivir con otras apps en el mismo proyecto.
-- No agrega triggers en auth.users: el perfil lo crea la app después del registro.

-- ---------- tablas ----------

create table public.fogon_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{2,32}$'),
  display_name text not null check (length(display_name) between 1 and 40),
  color text not null default '#e07a3f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.fogon_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  owner_id uuid not null references public.fogon_profiles(id) on delete cascade,
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  created_at timestamptz not null default now()
);
create index on public.fogon_servers (owner_id);

create table public.fogon_members (
  server_id uuid not null references public.fogon_servers(id) on delete cascade,
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index on public.fogon_members (user_id);

create table public.fogon_channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.fogon_servers(id) on delete cascade,
  kind text not null check (kind in ('text', 'category', 'dm')),
  name text not null default '' check (length(name) <= 100),
  topic text not null default '' check (length(topic) <= 1024),
  position int not null default 0,
  parent_id uuid references public.fogon_channels(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dm_has_no_server check ((kind = 'dm') = (server_id is null)),
  constraint named_unless_dm check (kind = 'dm' or length(btrim(name)) >= 1)
);
create index on public.fogon_channels (server_id, position);
create index on public.fogon_channels (parent_id);

create table public.fogon_dm_participants (
  channel_id uuid not null references public.fogon_channels(id) on delete cascade,
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  primary key (channel_id, user_id)
);
create index on public.fogon_dm_participants (user_id);

create table public.fogon_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.fogon_channels(id) on delete cascade,
  author_id uuid not null references public.fogon_profiles(id) on delete cascade,
  content text not null default '' check (length(content) <= 2000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4),
  mentions uuid[] not null default '{}',
  reply_to_id uuid references public.fogon_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint not_empty check (length(btrim(content)) > 0 or jsonb_array_length(attachments) > 0)
);
create index on public.fogon_messages (channel_id, created_at desc);
create index on public.fogon_messages using gin (mentions);
create index on public.fogon_messages (reply_to_id);
create index on public.fogon_messages (author_id);

create table public.fogon_reactions (
  message_id uuid not null references public.fogon_messages(id) on delete cascade,
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index on public.fogon_reactions (user_id);

create table public.fogon_read_states (
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  channel_id uuid not null references public.fogon_channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index on public.fogon_read_states (channel_id);

-- ---------- helpers de acceso (security definer: evitan recursión de RLS) ----------

create or replace function public.fogon_is_member(p_server uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_members m where m.server_id = p_server and m.user_id = auth.uid());
$$;

create or replace function public.fogon_is_owner(p_server uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_servers s where s.id = p_server and s.owner_id = auth.uid());
$$;

create or replace function public.fogon_can_read(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fogon_channels c
    where c.id = p_channel
      and (
        (c.kind = 'dm' and exists (select 1 from public.fogon_dm_participants d where d.channel_id = c.id and d.user_id = auth.uid()))
        or (c.kind <> 'dm' and exists (select 1 from public.fogon_members m where m.server_id = c.server_id and m.user_id = auth.uid()))
      )
  );
$$;

-- ruta de storage "<channel_id>/<user_id>/<archivo>": nunca falla con rutas raras
create or replace function public.fogon_can_read_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] !~ '^[0-9a-f-]{36}$' then return false; end if;
  return public.fogon_can_read(parts[1]::uuid);
end $$;

-- ---------- triggers ----------

-- menciones calculadas en el servidor: solo cuentan miembros que pueden leer el canal
create or replace function public.fogon_messages_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ch public.fogon_channels;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content then
      new.edited_at := now();
    end if;
    new.author_id := old.author_id;
    new.channel_id := old.channel_id;
    new.created_at := old.created_at;
    new.reply_to_id := old.reply_to_id;
    new.attachments := old.attachments;
  else
    new.created_at := now();
    new.edited_at := null;
  end if;

  select * into ch from public.fogon_channels where id = new.channel_id;
  new.mentions := coalesce((
    select array_agg(distinct p.id)
    from regexp_matches(new.content, '@([A-Za-z0-9_.]{2,32})', 'g') as m(arr)
    join public.fogon_profiles p on p.username = lower(m.arr[1])
    where p.id <> new.author_id
      and (
        (ch.kind = 'dm' and exists (select 1 from public.fogon_dm_participants d where d.channel_id = ch.id and d.user_id = p.id))
        or (ch.kind <> 'dm' and exists (select 1 from public.fogon_members mm where mm.server_id = ch.server_id and mm.user_id = p.id))
      )
  ), '{}');
  return new;
end $$;

create trigger fogon_messages_before
  before insert or update on public.fogon_messages
  for each row execute function public.fogon_messages_before();

create or replace function public.fogon_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.fogon_channels set last_message_at = new.created_at where id = new.channel_id;
  insert into public.fogon_read_states (user_id, channel_id, last_read_at)
  values (new.author_id, new.channel_id, new.created_at)
  on conflict (user_id, channel_id) do update set last_read_at = greatest(public.fogon_read_states.last_read_at, excluded.last_read_at);
  return null;
end $$;

create trigger fogon_messages_after_insert
  after insert on public.fogon_messages
  for each row execute function public.fogon_messages_after_insert();

-- un canal solo puede colgar de una categoría del mismo servidor
create or replace function public.fogon_channels_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.fogon_channels c where c.id = new.parent_id and c.kind = 'category' and c.server_id = new.server_id
  ) then
    raise exception 'La categoría no pertenece a este servidor';
  end if;
  if new.kind = 'category' and new.parent_id is not null then
    raise exception 'Una categoría no puede estar dentro de otra';
  end if;
  if tg_op = 'UPDATE' then
    new.server_id := old.server_id;
    new.kind := old.kind;
  end if;
  return new;
end $$;

create trigger fogon_channels_check
  before insert or update on public.fogon_channels
  for each row execute function public.fogon_channels_check();

-- ---------- RPCs (operaciones de varias tablas, atómicas) ----------

create or replace function public.fogon_create_server(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  cat uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if not exists (select 1 from public.fogon_profiles where id = auth.uid()) then raise exception 'Completá tu perfil primero'; end if;
  if (select count(*) from public.fogon_members where user_id = auth.uid()) >= 100 then raise exception 'Llegaste al máximo de 100 servidores'; end if;
  insert into public.fogon_servers (name, owner_id) values (btrim(p_name), auth.uid()) returning id into sid;
  insert into public.fogon_members (server_id, user_id) values (sid, auth.uid());
  insert into public.fogon_channels (server_id, kind, name, position) values (sid, 'category', 'Canales de texto', 0) returning id into cat;
  insert into public.fogon_channels (server_id, kind, name, position, parent_id, topic)
    values (sid, 'text', 'general', 0, cat, 'Para charlar de todo');
  return sid;
end $$;

create or replace function public.fogon_invite_info(p_code text)
returns table (server_id uuid, name text, members bigint, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, (select count(*) from public.fogon_members m where m.server_id = s.id),
         exists (select 1 from public.fogon_members m where m.server_id = s.id and m.user_id = auth.uid())
  from public.fogon_servers s where s.invite_code = p_code and auth.uid() is not null;
$$;

create or replace function public.fogon_join_server(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if not exists (select 1 from public.fogon_profiles where id = auth.uid()) then raise exception 'Completá tu perfil primero'; end if;
  select id into sid from public.fogon_servers where invite_code = p_code;
  if sid is null then raise exception 'La invitación no es válida o ya no existe'; end if;
  insert into public.fogon_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create or replace function public.fogon_reset_invite(p_server uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.fogon_is_owner(p_server) then raise exception 'Solo el dueño puede cambiar la invitación'; end if;
  update public.fogon_servers set invite_code = substr(md5(gen_random_uuid()::text), 1, 10) where id = p_server returning invite_code into code;
  return code;
end $$;

create or replace function public.fogon_open_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if p_other = auth.uid() then raise exception 'No podés mandarte un mensaje directo a vos mismo'; end if;
  if not exists (select 1 from public.fogon_profiles where id = p_other) then raise exception 'Ese usuario no existe'; end if;
  select a.channel_id into cid
  from public.fogon_dm_participants a
  join public.fogon_dm_participants b on a.channel_id = b.channel_id
  where a.user_id = auth.uid() and b.user_id = p_other
  limit 1;
  if cid is not null then return cid; end if;
  insert into public.fogon_channels (kind) values ('dm') returning id into cid;
  insert into public.fogon_dm_participants (channel_id, user_id) values (cid, auth.uid()), (cid, p_other);
  return cid;
end $$;

create or replace function public.fogon_mark_read(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_can_read(p_channel) then return; end if;
  insert into public.fogon_read_states (user_id, channel_id, last_read_at) values (auth.uid(), p_channel, now())
  on conflict (user_id, channel_id) do update set last_read_at = now();
end $$;

-- no leídos y menciones de todos los canales visibles, en una sola llamada
create or replace function public.fogon_unread()
returns table (channel_id uuid, unread boolean, mentions bigint)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select c.id, c.last_message_at from public.fogon_channels c
    join public.fogon_members m on m.server_id = c.server_id and m.user_id = auth.uid()
    where c.kind = 'text'
    union all
    select c.id, c.last_message_at from public.fogon_channels c
    join public.fogon_dm_participants d on d.channel_id = c.id and d.user_id = auth.uid()
  )
  select v.id,
         v.last_message_at is not null and v.last_message_at > coalesce(r.last_read_at, '-infinity'),
         (select count(*) from public.fogon_messages msg
           where msg.channel_id = v.id and msg.created_at > coalesce(r.last_read_at, '-infinity')
             and auth.uid() = any(msg.mentions))
  from visible v
  left join public.fogon_read_states r on r.channel_id = v.id and r.user_id = auth.uid();
$$;

-- ---------- RLS ----------

alter table public.fogon_profiles enable row level security;
alter table public.fogon_servers enable row level security;
alter table public.fogon_members enable row level security;
alter table public.fogon_channels enable row level security;
alter table public.fogon_dm_participants enable row level security;
alter table public.fogon_messages enable row level security;
alter table public.fogon_reactions enable row level security;
alter table public.fogon_read_states enable row level security;

-- perfiles: cualquier usuario logueado puede buscar por nombre de usuario (para DMs); cada uno edita el suyo
create policy fogon_profiles_select on public.fogon_profiles for select to authenticated using (true);
create policy fogon_profiles_insert on public.fogon_profiles for insert to authenticated with check (id = (select auth.uid()));
create policy fogon_profiles_update on public.fogon_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- servidores: los ven los miembros; los crea fogon_create_server; el dueño renombra y borra
create policy fogon_servers_select on public.fogon_servers for select to authenticated using (public.fogon_is_member(id));
create policy fogon_servers_update on public.fogon_servers for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy fogon_servers_delete on public.fogon_servers for delete to authenticated using (owner_id = (select auth.uid()));

-- miembros: se ven entre miembros; uno se va solo (el dueño no) o el dueño echa
create policy fogon_members_select on public.fogon_members for select to authenticated using (public.fogon_is_member(server_id));
create policy fogon_members_delete on public.fogon_members for delete to authenticated using (
  (user_id = (select auth.uid()) and not public.fogon_is_owner(server_id))
  or (public.fogon_is_owner(server_id) and user_id <> (select auth.uid()))
);

-- canales: los ve quien puede leerlos; el dueño del servidor los administra (los DMs solo por RPC)
create policy fogon_channels_select on public.fogon_channels for select to authenticated using (public.fogon_can_read(id));
create policy fogon_channels_insert on public.fogon_channels for insert to authenticated with check (kind <> 'dm' and public.fogon_is_owner(server_id));
create policy fogon_channels_update on public.fogon_channels for update to authenticated using (kind <> 'dm' and public.fogon_is_owner(server_id)) with check (kind <> 'dm' and public.fogon_is_owner(server_id));
create policy fogon_channels_delete on public.fogon_channels for delete to authenticated using (kind <> 'dm' and public.fogon_is_owner(server_id));

create policy fogon_dm_participants_select on public.fogon_dm_participants for select to authenticated using (public.fogon_can_read(channel_id));

-- mensajes: lee y escribe quien puede leer el canal; edita el autor; borra el autor o el dueño del servidor
create policy fogon_messages_select on public.fogon_messages for select to authenticated using (public.fogon_can_read(channel_id));
create policy fogon_messages_insert on public.fogon_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and public.fogon_can_read(channel_id)
  and exists (select 1 from public.fogon_channels c where c.id = channel_id and c.kind in ('text', 'dm'))
);
create policy fogon_messages_update on public.fogon_messages for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy fogon_messages_delete on public.fogon_messages for delete to authenticated using (
  author_id = (select auth.uid())
  or exists (select 1 from public.fogon_channels c where c.id = channel_id and c.server_id is not null and public.fogon_is_owner(c.server_id))
);

-- reacciones
create policy fogon_reactions_select on public.fogon_reactions for select to authenticated using (
  exists (select 1 from public.fogon_messages m where m.id = message_id and public.fogon_can_read(m.channel_id))
);
create policy fogon_reactions_insert on public.fogon_reactions for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.fogon_messages m where m.id = message_id and public.fogon_can_read(m.channel_id))
);
create policy fogon_reactions_delete on public.fogon_reactions for delete to authenticated using (user_id = (select auth.uid()));

-- estado de lectura: cada uno el suyo
create policy fogon_read_states_select on public.fogon_read_states for select to authenticated using (user_id = (select auth.uid()));

-- columnas editables: el contenido del mensaje y nada más
revoke update on public.fogon_messages from anon, authenticated;
grant update (content) on public.fogon_messages to authenticated;
revoke update on public.fogon_servers from anon, authenticated;
grant update (name) on public.fogon_servers to authenticated;
revoke update on public.fogon_profiles from anon, authenticated;
grant update (display_name, color) on public.fogon_profiles to authenticated;

-- anon no toca nada de Fogón
revoke all on public.fogon_profiles, public.fogon_servers, public.fogon_members, public.fogon_channels,
  public.fogon_dm_participants, public.fogon_messages, public.fogon_reactions, public.fogon_read_states from anon;

-- funciones: solo usuarios logueados
revoke execute on function public.fogon_is_member(uuid), public.fogon_is_owner(uuid), public.fogon_can_read(uuid),
  public.fogon_can_read_object(text), public.fogon_create_server(text), public.fogon_invite_info(text),
  public.fogon_join_server(text), public.fogon_reset_invite(uuid), public.fogon_open_dm(uuid),
  public.fogon_mark_read(uuid), public.fogon_unread() from public, anon;
grant execute on function public.fogon_is_member(uuid), public.fogon_is_owner(uuid), public.fogon_can_read(uuid),
  public.fogon_can_read_object(text), public.fogon_create_server(text), public.fogon_invite_info(text),
  public.fogon_join_server(text), public.fogon_reset_invite(uuid), public.fogon_open_dm(uuid),
  public.fogon_mark_read(uuid), public.fogon_unread() to authenticated;
revoke execute on function public.fogon_messages_before(), public.fogon_messages_after_insert(), public.fogon_channels_check() from public, anon, authenticated;

-- ---------- realtime ----------

alter publication supabase_realtime add table public.fogon_messages, public.fogon_reactions, public.fogon_channels, public.fogon_members, public.fogon_servers;

-- ---------- storage: imágenes adjuntas ----------
-- ruta: <channel_id>/<user_id>/<archivo>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fogon-attachments', 'fogon-attachments', false, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy fogon_attachments_read on storage.objects for select to authenticated using (
  bucket_id = 'fogon-attachments' and public.fogon_can_read_object(name)
);
create policy fogon_attachments_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'fogon-attachments'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and public.fogon_can_read_object(name)
);
create policy fogon_attachments_delete on storage.objects for delete to authenticated using (
  bucket_id = 'fogon-attachments' and split_part(name, '/', 2) = (select auth.uid())::text
);
