-- Ban permanente de cuenta (de toda la plataforma): solo los admins de Fogón.
-- La cuenta no puede volver a iniciar sesión, se le cierran las sesiones abiertas,
-- sale de todos los servidores y no puede escribir más. Se puede quitar el ban.

create table if not exists public.fogon_account_bans (
  user_id uuid primary key references public.fogon_profiles (id) on delete cascade,
  reason text not null default '' check (length(reason) <= 300),
  banned_by uuid references public.fogon_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.fogon_account_bans enable row level security;
revoke all on public.fogon_account_bans from anon, authenticated;
grant select on public.fogon_account_bans to authenticated;
-- los admins ven todos; cada uno ve el suyo (para mostrarle que está suspendido)
create policy fogon_account_bans_select on public.fogon_account_bans for select to authenticated
  using (user_id = (select auth.uid()) or public.fogon_is_admin());
alter publication supabase_realtime add table public.fogon_account_bans;

create or replace function public.fogon_is_account_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_account_bans where user_id = p_user)
$$;
revoke execute on function public.fogon_is_account_banned(uuid) from public, anon;
grant execute on function public.fogon_is_account_banned(uuid) to authenticated;

create or replace function public.fogon_account_ban(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bot boolean;
begin
  if not public.fogon_is_admin() then raise exception 'Solo el equipo de Fogón puede banear cuentas.'; end if;
  if p_user = auth.uid() then raise exception 'No te podés banear a vos mismo.'; end if;
  if exists (select 1 from public.fogon_admins where user_id = p_user) then raise exception 'No se puede banear a un admin de Fogón.'; end if;
  select is_bot into v_bot from public.fogon_profiles where id = p_user;
  if v_bot is null then raise exception 'Esa cuenta no existe.'; end if;
  if v_bot then raise exception 'Los bots no se banean: sacalos del servidor.'; end if;

  insert into public.fogon_account_bans (user_id, reason, banned_by)
  values (p_user, left(btrim(coalesce(p_reason, '')), 300), auth.uid())
  on conflict (user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();

  -- no puede volver a entrar y se le cierran las sesiones
  update auth.users set banned_until = 'infinity' where id = p_user;
  delete from auth.sessions where user_id = p_user;
  update auth.refresh_tokens set revoked = true where user_id = p_user::text;

  -- sale de todos los servidores (los que son suyos quedan, pero nadie más puede entrar con su cuenta)
  delete from public.fogon_member_roles where user_id = p_user;
  delete from public.fogon_members m where m.user_id = p_user
    and not exists (select 1 from public.fogon_servers s where s.id = m.server_id and s.owner_id = p_user);
  update public.fogon_profiles set status = 'invisible', custom_status = '' where id = p_user;
  update public.fogon_boosts set server_id = null, boosted_at = null where user_id = p_user and server_id is not null;
end $$;
revoke execute on function public.fogon_account_ban(uuid, text) from public, anon;
grant execute on function public.fogon_account_ban(uuid, text) to authenticated;

create or replace function public.fogon_account_unban(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_is_admin() then raise exception 'Solo el equipo de Fogón puede quitar un ban.'; end if;
  delete from public.fogon_account_bans where user_id = p_user;
  update auth.users set banned_until = null where id = p_user;
end $$;
revoke execute on function public.fogon_account_unban(uuid) from public, anon;
grant execute on function public.fogon_account_unban(uuid) to authenticated;

-- aunque le quede un token vivo un rato, no puede escribir, reaccionar ni unirse a nada
create or replace function public.fogon_account_ban_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and exists (select 1 from public.fogon_account_bans where user_id = uid) then
    raise exception 'Tu cuenta de Fogón está suspendida.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.fogon_account_ban_guard() from public, anon, authenticated;
create or replace trigger fogon_account_ban_guard before insert on public.fogon_messages for each row execute function public.fogon_account_ban_guard();
create or replace trigger fogon_account_ban_guard before insert on public.fogon_reactions for each row execute function public.fogon_account_ban_guard();
create or replace trigger fogon_account_ban_guard before insert on public.fogon_members for each row execute function public.fogon_account_ban_guard();
create or replace trigger fogon_account_ban_guard before insert or update on public.fogon_profiles for each row execute function public.fogon_account_ban_guard();
