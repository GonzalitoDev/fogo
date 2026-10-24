-- Amigos y bloqueos al estilo Discord, mensajes fijados y "último leído" para la línea de NUEVOS.

-- ---------- amigos ----------
create table public.fogon_friends (
  requester uuid not null references public.fogon_profiles(id) on delete cascade,
  addressee uuid not null references public.fogon_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index fogon_friends_pair on public.fogon_friends (least(requester, addressee), greatest(requester, addressee));
create index on public.fogon_friends (addressee);

create table public.fogon_blocks (
  blocker uuid not null references public.fogon_profiles(id) on delete cascade,
  blocked uuid not null references public.fogon_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

alter table public.fogon_friends enable row level security;
alter table public.fogon_blocks enable row level security;
revoke all on public.fogon_friends, public.fogon_blocks from anon;
revoke insert, update on public.fogon_friends from authenticated;
revoke insert, update on public.fogon_blocks from authenticated;
create policy fogon_friends_select on public.fogon_friends for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy fogon_friends_delete on public.fogon_friends for delete to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));
create policy fogon_blocks_select on public.fogon_blocks for select to authenticated using (blocker = (select auth.uid()));
create policy fogon_blocks_delete on public.fogon_blocks for delete to authenticated using (blocker = (select auth.uid()));

create or replace function public.fogon_is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_blocks b where (b.blocker = p_a and b.blocked = p_b) or (b.blocker = p_b and b.blocked = p_a));
$$;

-- mandar solicitud por @usuario (si el otro ya te había mandado una, quedan amigos)
create or replace function public.fogon_friend_request(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other uuid;
begin
  if me is null then raise exception 'Tenés que iniciar sesión'; end if;
  select id into other from public.fogon_profiles where username = lower(trim(both '@' from p_username));
  if other is null then raise exception 'No encontramos a nadie con ese usuario. Revisá que esté bien escrito.'; end if;
  if other = me then raise exception 'No podés agregarte a vos mismo'; end if;
  if public.fogon_is_blocked_between(me, other) then raise exception 'No se puede mandar la solicitud'; end if;
  if exists (select 1 from public.fogon_friends where requester = me and addressee = other) or
     exists (select 1 from public.fogon_friends where requester = other and addressee = me and status = 'accepted') then
    return 'ya';
  end if;
  if exists (select 1 from public.fogon_friends where requester = other and addressee = me and status = 'pending') then
    update public.fogon_friends set status = 'accepted', accepted_at = now() where requester = other and addressee = me;
    return 'aceptada';
  end if;
  insert into public.fogon_friends (requester, addressee) values (me, other);
  return 'enviada';
end $$;

create or replace function public.fogon_friend_accept(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fogon_friends set status = 'accepted', accepted_at = now()
  where requester = p_other and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'Esa solicitud ya no existe'; end if;
end $$;

create or replace function public.fogon_block(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_other = auth.uid() then raise exception 'No podés bloquearte a vos mismo'; end if;
  delete from public.fogon_friends where (requester = auth.uid() and addressee = p_other) or (requester = p_other and addressee = auth.uid());
  insert into public.fogon_blocks (blocker, blocked) values (auth.uid(), p_other) on conflict do nothing;
end $$;

-- los bloqueados no pueden abrir ni escribir en un mensaje directo
create or replace function public.fogon_dm_block_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if exists (select 1 from public.fogon_channels c where c.id = new.channel_id and c.kind = 'dm') then
    select d.user_id into other from public.fogon_dm_participants d where d.channel_id = new.channel_id and d.user_id <> new.author_id limit 1;
    if other is not null and public.fogon_is_blocked_between(new.author_id, other) then
      raise exception 'No podés mandarle mensajes a esta persona' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger fogon_dm_block_check before insert on public.fogon_messages
  for each row execute function public.fogon_dm_block_check();

-- ---------- fijados ----------
alter table public.fogon_messages add column pinned_at timestamptz, add column pinned_by uuid references public.fogon_profiles(id) on delete set null;
create index on public.fogon_messages (channel_id, pinned_at desc) where pinned_at is not null;

create or replace function public.fogon_pin(p_message uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ch uuid; sid uuid; kind text;
begin
  select m.channel_id, c.server_id, c.kind into ch, sid, kind from public.fogon_messages m join public.fogon_channels c on c.id = m.channel_id where m.id = p_message;
  if ch is null or not public.fogon_can_read(ch) then raise exception 'Ese mensaje no existe'; end if;
  if kind <> 'dm' and not public.fogon_has_perm(sid, 'manage_messages') then raise exception 'Necesitás el permiso de administrar mensajes para fijar' using errcode = '42501'; end if;
  if p_on and (select count(*) from public.fogon_messages where channel_id = ch and pinned_at is not null) >= 50 then
    raise exception 'Este canal ya tiene 50 mensajes fijados';
  end if;
  update public.fogon_messages set pinned_at = case when p_on then now() end, pinned_by = case when p_on then auth.uid() end where id = p_message;
end $$;

-- ---------- último leído (antes de marcar como leído) ----------
create or replace function public.fogon_last_read(p_channel uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select r.last_read_at from public.fogon_read_states r where r.user_id = auth.uid() and r.channel_id = p_channel;
$$;

revoke execute on function public.fogon_is_blocked_between(uuid, uuid), public.fogon_friend_request(text), public.fogon_friend_accept(uuid),
  public.fogon_block(uuid), public.fogon_pin(uuid, boolean), public.fogon_last_read(uuid) from public, anon;
grant execute on function public.fogon_is_blocked_between(uuid, uuid), public.fogon_friend_request(text), public.fogon_friend_accept(uuid),
  public.fogon_block(uuid), public.fogon_pin(uuid, boolean), public.fogon_last_read(uuid) to authenticated;
revoke execute on function public.fogon_dm_block_check() from public, anon, authenticated;

alter publication supabase_realtime add table public.fogon_friends;
