-- Actividad de seguridad: cada usuario ve sus inicios de sesión y cambios importantes de la cuenta.
-- Lo escriben triggers sobre auth, así nadie puede inventar ni borrar entradas desde la app.

create table if not exists public.fogon_security_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('login', 'mfa_on', 'mfa_off', 'password', 'email')),
  session_id uuid, -- en los inicios de sesión: para no avisarte del que acabás de hacer vos
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists fogon_security_log_user on public.fogon_security_log (user_id, created_at desc);
alter table public.fogon_security_log enable row level security;
revoke all on public.fogon_security_log from anon, authenticated;
grant select on public.fogon_security_log to authenticated;
drop policy if exists fogon_security_log_select on public.fogon_security_log;
create policy fogon_security_log_select on public.fogon_security_log for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists fogon_mfa on public.fogon_security_log;
create policy fogon_mfa on public.fogon_security_log as restrictive for all to authenticated
  using ((select public.fogon_mfa_ok())) with check ((select public.fogon_mfa_ok()));

-- un error acá nunca tiene que impedir entrar ni cambiar la cuenta
create or replace function public.fogon_security_note(p_user uuid, p_kind text, p_ua text, p_ip text, p_session uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fogon_security_log (user_id, kind, session_id, user_agent, ip) values (p_user, p_kind, p_session, left(p_ua, 400), p_ip);
  -- guardamos lo último: 200 por persona
  delete from public.fogon_security_log l where l.user_id = p_user and l.id < (
    select x.id from public.fogon_security_log x where x.user_id = p_user order by x.id desc offset 199 limit 1);
exception when others then null;
end $$;
revoke execute on function public.fogon_security_note(uuid, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.fogon_security_on_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.fogon_security_note(new.user_id, 'login', new.user_agent, host(new.ip), new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists fogon_security_on_session on auth.sessions;
create trigger fogon_security_on_session after insert on auth.sessions
  for each row execute function public.fogon_security_on_session();

create or replace function public.fogon_security_on_factor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = 'verified' and old.status is distinct from 'verified' then
    perform public.fogon_security_note(new.user_id, 'mfa_on', null, null);
  elsif tg_op = 'DELETE' and old.status = 'verified' then
    perform public.fogon_security_note(old.user_id, 'mfa_off', null, null);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists fogon_security_on_factor on auth.mfa_factors;
create trigger fogon_security_on_factor after update or delete on auth.mfa_factors
  for each row execute function public.fogon_security_on_factor();

create or replace function public.fogon_security_on_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    perform public.fogon_security_note(new.id, 'password', null, null);
  end if;
  if new.email is distinct from old.email then
    perform public.fogon_security_note(new.id, 'email', null, null);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists fogon_security_on_user on auth.users;
create trigger fogon_security_on_user after update of encrypted_password, email on auth.users
  for each row execute function public.fogon_security_on_user();
