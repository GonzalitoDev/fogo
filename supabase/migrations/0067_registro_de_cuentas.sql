-- Registro de cuentas: solo Gonza (dueño) ve todas las cuentas de Fogón con sus datos de acceso.
-- Los emails, IPs e inicios de sesión salen de auth y solo se leen por esta función: nadie más puede pedirlos.

create or replace function public.fogon_owner_accounts()
returns table (
  id uuid, username text, display_name text, email text, created_at timestamptz,
  last_sign_in_at timestamptz, confirmed boolean, mfa boolean, sessions bigint, last_ip text, last_device text,
  banned boolean, ban_reason text, deleted boolean, premium boolean, staff boolean,
  servers bigint, messages bigint, problems bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  -- también con dos pasos: si alguien te roba la contraseña, no puede ver el registro
  if not public.fogon_is_fogon_owner() or not public.fogon_mfa_ok() then raise exception 'Solo el dueño de Fogón puede ver el registro de cuentas'; end if;
  return query
    select p.id, p.username, p.display_name, u.email::text, coalesce(u.created_at, p.created_at),
           u.last_sign_in_at, u.email_confirmed_at is not null,
           exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
           (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
           (select l.ip from public.fogon_security_log l where l.user_id = p.id and l.kind = 'login' order by l.id desc limit 1),
           (select l.user_agent from public.fogon_security_log l where l.user_id = p.id and l.kind = 'login' order by l.id desc limit 1),
           b.user_id is not null, b.reason, p.deleted_at is not null, coalesce(p.premium, false),
           exists (select 1 from public.fogon_admins a where a.user_id = p.id),
           (select count(*) from public.fogon_members m where m.user_id = p.id),
           (select count(*) from public.fogon_messages x where x.author_id = p.id),
           (select count(*) from public.fogon_problems x where x.user_id = p.id)
    from public.fogon_profiles p
    left join auth.users u on u.id = p.id
    left join public.fogon_account_bans b on b.user_id = p.id
    where not coalesce(p.is_bot, false)
    order by coalesce(u.created_at, p.created_at) desc;
end $$;
revoke execute on function public.fogon_owner_accounts() from public, anon;
grant execute on function public.fogon_owner_accounts() to authenticated;
