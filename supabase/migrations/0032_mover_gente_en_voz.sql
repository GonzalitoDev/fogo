-- Mover gente entre canales de voz: el dueño o quien administra canales puede arrastrar a alguien
-- (o usar el menú) y su navegador lo cambia de canal solo. También sirve para mover bots.
-- El que mueve tiene que poder ver el canal y estar por encima del movido.

create table if not exists public.fogon_voice_moves (
  user_id uuid primary key references public.fogon_profiles(id) on delete cascade,
  channel_id uuid references public.fogon_channels(id) on delete cascade,
  by_id uuid not null references public.fogon_profiles(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.fogon_voice_moves enable row level security;
alter table public.fogon_voice_moves replica identity full;

drop policy if exists fogon_voice_moves_read on public.fogon_voice_moves;
drop policy if exists fogon_voice_moves_delete on public.fogon_voice_moves;
create policy fogon_voice_moves_read on public.fogon_voice_moves for select to authenticated using (user_id = auth.uid());
create policy fogon_voice_moves_delete on public.fogon_voice_moves for delete to authenticated using (user_id = auth.uid());
revoke all on public.fogon_voice_moves from public, anon, authenticated;
grant select, delete on public.fogon_voice_moves to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fogon_voice_moves') then
    execute 'alter publication supabase_realtime add table public.fogon_voice_moves';
  end if;
end $$;

create or replace function public.fogon_voice_move(p_user uuid, p_channel uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  target public.fogon_profiles;
  ch public.fogon_channels;
begin
  if me is null then raise exception 'Iniciá sesión para mover gente'; end if;
  select * into target from public.fogon_profiles where id = p_user;
  if target.id is null then raise exception 'Esa persona no existe'; end if;

  select * into ch from public.fogon_channels where id = p_channel;
  if ch.id is null or ch.kind <> 'voice' then raise exception 'Ese canal no es de voz'; end if;
  if not public.fogon_can_read(p_channel) then raise exception 'No podés ver ese canal'; end if;

  if p_user <> me then
    if not target.is_bot and not exists (
      select 1 from public.fogon_members m where m.server_id = ch.server_id and m.user_id = p_user
    ) then raise exception 'Esa persona no está en el servidor'; end if;
    if not public.fogon_has_perm(ch.server_id, 'manage_channels') then
      raise exception 'No tenés permiso para mover gente en este servidor';
    end if;
    if not target.is_bot and not public.fogon_outranks(ch.server_id, p_user) then
      raise exception 'No podés mover a alguien de tu mismo rango o más alto';
    end if;
  end if;

  -- los bots no tienen navegador: se les cambia el canal en la base
  if target.is_bot then
    insert into public.fogon_bot_voice (bot_id, channel_id, muted, deafened, since, leave_at)
    values (p_user, p_channel, true, false, now(), now() + interval '3 hours')
    on conflict (bot_id) do update
      set channel_id = excluded.channel_id, since = excluded.since, leave_at = excluded.leave_at;
    return jsonb_build_object('ok', true, 'bot', true);
  end if;

  -- los humanos: se le avisa a su navegador y él se cambia
  delete from public.fogon_voice_moves where user_id = p_user or at < now() - interval '2 minutes';
  insert into public.fogon_voice_moves (user_id, channel_id, by_id, at) values (p_user, p_channel, me, now());
  return jsonb_build_object('ok', true, 'bot', false);
end $$;
revoke execute on function public.fogon_voice_move(uuid, uuid) from public, anon;
grant execute on function public.fogon_voice_move(uuid, uuid) to authenticated;
