-- Seguridad de cuentas: verificación en dos pasos (TOTP) y sesiones abiertas.

-- 1) Dos pasos de verdad: si tenés un factor verificado, la base no te deja leer ni escribir
--    nada de Fogón hasta que la sesión pase el segundo paso (aal2). No alcanza con esconderlo en la app.
create or replace function public.fogon_mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke execute on function public.fogon_mfa_ok() from public, anon;
grant execute on function public.fogon_mfa_ok() to authenticated;

do $$
declare t record;
begin
  for t in select c.relname from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity and c.relname like 'fogon\_%'
  loop
    execute format('drop policy if exists fogon_mfa on public.%I', t.relname);
    execute format('create policy fogon_mfa on public.%I as restrictive for all to authenticated using ((select public.fogon_mfa_ok())) with check ((select public.fogon_mfa_ok()))', t.relname);
  end loop;
end $$;

-- 2) Sesiones abiertas: ver en qué dispositivos está tu cuenta y cerrar las que no reconocés.
create or replace function public.fogon_my_sessions()
returns table (id uuid, created_at timestamptz, last_seen timestamptz, user_agent text, ip text, aal text, current boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión'; end if;
  if not public.fogon_mfa_ok() then raise exception 'Primero completá la verificación en dos pasos'; end if;
  return query
    select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
           s.user_agent, host(s.ip), s.aal::text, s.id::text = (auth.jwt()->>'session_id')
    from auth.sessions s
    where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
    order by 3 desc;
end $$;
revoke execute on function public.fogon_my_sessions() from public, anon;
grant execute on function public.fogon_my_sessions() to authenticated;

create or replace function public.fogon_end_session(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Iniciá sesión'; end if;
  if not public.fogon_mfa_ok() then raise exception 'Primero completá la verificación en dos pasos'; end if;
  if p_id::text = (auth.jwt()->>'session_id') then raise exception 'Para esta sesión usá «Cerrar sesión»'; end if;
  -- borrar la sesión invalida sus refresh tokens: ese dispositivo queda afuera al renovar (máx. 1 hora)
  delete from auth.sessions where id = p_id and user_id = auth.uid();
end $$;
revoke execute on function public.fogon_end_session(uuid) from public, anon;
grant execute on function public.fogon_end_session(uuid) to authenticated;

-- 3) [menor] Al editar tu mensaje no podías fijarlo vos mismo salteando el permiso: solo fogon_pin (u otras
--    funciones internas) cambian pinned_at/pinned_by.
do $$
declare def text := pg_get_functiondef('public.fogon_messages_before'::regproc);
begin
  -- solo busca la línea (sin depender de los saltos de línea, que cambian al copiar y pegar)
  def := replace(def, 'new.attachments := old.attachments;',
    'new.attachments := old.attachments; if current_user = ''authenticated'' then new.pinned_at := old.pinned_at; new.pinned_by := old.pinned_by; end if;');
  if position('new.pinned_at := old.pinned_at' in def) = 0 then raise exception 'no pude ajustar fogon_messages_before'; end if;
  execute def;
end $$;
