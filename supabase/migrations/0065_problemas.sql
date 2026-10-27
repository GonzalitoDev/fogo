-- Problemas: cualquiera reporta un problema desde Ajustes y le llega directo a Gonza (dueño de Fogón),
-- que lo contesta ahí mismo. Cada reporte es una charla privada entre quien lo mandó y Gonza.
-- Se escribe solo por funciones (con límites); las tablas se leen con RLS.

create or replace function public.fogon_is_fogon_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = 'e7809edc-8559-4df6-8d2b-1fffc7a27719'::uuid;
$$;
revoke execute on function public.fogon_is_fogon_owner() from public, anon;
grant execute on function public.fogon_is_fogon_owner() to authenticated;

create table if not exists public.fogon_problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'security', 'account', 'idea', 'other')),
  title text not null check (length(title) between 3 and 120),
  info jsonb not null default '{}', -- navegador, pantalla, dónde estaba: ayuda a reproducirlo
  status text not null default 'open' check (status in ('open', 'seen', 'fixed', 'closed')),
  unread_user boolean not null default false,  -- Gonza contestó y la persona no lo vio
  unread_owner boolean not null default true,  -- hay algo nuevo que Gonza no vio
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fogon_problems_user on public.fogon_problems (user_id, updated_at desc);
create index if not exists fogon_problems_updated on public.fogon_problems (updated_at desc);

create table if not exists public.fogon_problem_msgs (
  id bigint generated always as identity primary key,
  problem_id uuid not null references public.fogon_problems (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists fogon_problem_msgs_problem on public.fogon_problem_msgs (problem_id, id);

alter table public.fogon_problems enable row level security;
alter table public.fogon_problem_msgs enable row level security;
revoke all on public.fogon_problems, public.fogon_problem_msgs from anon, authenticated;
grant select on public.fogon_problems, public.fogon_problem_msgs to authenticated;

drop policy if exists fogon_problems_select on public.fogon_problems;
create policy fogon_problems_select on public.fogon_problems for select to authenticated
  using (user_id = (select auth.uid()) or (select public.fogon_is_fogon_owner()));
drop policy if exists fogon_problem_msgs_select on public.fogon_problem_msgs;
create policy fogon_problem_msgs_select on public.fogon_problem_msgs for select to authenticated
  using (exists (select 1 from public.fogon_problems p where p.id = problem_id
                 and (p.user_id = (select auth.uid()) or (select public.fogon_is_fogon_owner()))));
-- también respetan la verificación en dos pasos
drop policy if exists fogon_mfa on public.fogon_problems;
create policy fogon_mfa on public.fogon_problems as restrictive for all to authenticated
  using ((select public.fogon_mfa_ok())) with check ((select public.fogon_mfa_ok()));
drop policy if exists fogon_mfa on public.fogon_problem_msgs;
create policy fogon_mfa on public.fogon_problem_msgs as restrictive for all to authenticated
  using ((select public.fogon_mfa_ok())) with check ((select public.fogon_mfa_ok()));

-- Reportar: como mucho 5 por hora por persona, para que no se llene de spam.
create or replace function public.fogon_problem_report(p_kind text, p_title text, p_body text, p_info jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'Iniciá sesión para reportar un problema'; end if;
  if not public.fogon_mfa_ok() then raise exception 'Primero completá la verificación en dos pasos'; end if;
  if public.fogon_is_account_banned(me) then raise exception 'Tu cuenta está suspendida'; end if;
  if length(t) < 3 then raise exception 'Poné un título corto que describa el problema'; end if;
  if length(b) < 10 then raise exception 'Contá un poco más qué pasó'; end if;
  if (select count(*) from public.fogon_problems where user_id = me and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Mandaste muchos reportes seguidos. Esperá un rato y probá de nuevo';
  end if;
  insert into public.fogon_problems (user_id, kind, title, info)
  values (me, case when p_kind in ('bug', 'security', 'account', 'idea', 'other') then p_kind else 'other' end,
          left(t, 120), case when jsonb_typeof(p_info) = 'object' and length(p_info::text) <= 2000 then p_info else '{}' end)
  returning id into pid;
  insert into public.fogon_problem_msgs (problem_id, author_id, body) values (pid, me, left(b, 4000));
  return pid;
end $$;
revoke execute on function public.fogon_problem_report(text, text, text, jsonb) from public, anon;
grant execute on function public.fogon_problem_report(text, text, text, jsonb) to authenticated;

-- Contestar: quien lo reportó o Gonza.
create or replace function public.fogon_problem_reply(p_problem uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); p public.fogon_problems; owner boolean := public.fogon_is_fogon_owner(); b text := btrim(coalesce(p_body, ''));
begin
  if me is null then raise exception 'Iniciá sesión'; end if;
  if not public.fogon_mfa_ok() then raise exception 'Primero completá la verificación en dos pasos'; end if;
  select * into p from public.fogon_problems where id = p_problem;
  if not found or (p.user_id <> me and not owner) then raise exception 'Ese reporte no existe'; end if;
  if b = '' then raise exception 'Escribí algo'; end if;
  if not owner and p.status = 'closed' then raise exception 'Este reporte está cerrado. Si sigue pasando, mandá uno nuevo'; end if;
  if not owner and (select count(*) from public.fogon_problem_msgs where author_id = me and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Vas muy rápido. Esperá un ratito';
  end if;
  insert into public.fogon_problem_msgs (problem_id, author_id, body) values (p_problem, me, left(b, 4000));
  update public.fogon_problems set
    updated_at = now(),
    unread_user = case when owner and p.user_id <> me then true else unread_user end,
    unread_owner = case when owner then false else true end,
    status = case when owner and status = 'open' then 'seen' when not owner and status = 'fixed' then 'open' else status end
  where id = p_problem;
end $$;
revoke execute on function public.fogon_problem_reply(uuid, text) from public, anon;
grant execute on function public.fogon_problem_reply(uuid, text) to authenticated;

-- Estado (solo Gonza): visto, solucionado, cerrado o abierto de nuevo.
create or replace function public.fogon_problem_status(p_problem uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fogon_is_fogon_owner() or not public.fogon_mfa_ok() then raise exception 'Solo Gonza puede cambiar el estado'; end if;
  if p_status not in ('open', 'seen', 'fixed', 'closed') then raise exception 'Estado inválido'; end if;
  update public.fogon_problems set status = p_status, updated_at = now(), unread_owner = false,
    unread_user = case when p_status in ('fixed', 'closed') and status <> p_status then true else unread_user end
  where id = p_problem;
end $$;
revoke execute on function public.fogon_problem_status(uuid, text) from public, anon;
grant execute on function public.fogon_problem_status(uuid, text) to authenticated;

-- Marcar como leído (cada lado lo suyo).
create or replace function public.fogon_problem_seen(p_problem uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fogon_problems set unread_user = false where id = p_problem and user_id = auth.uid();
  if public.fogon_is_fogon_owner() then
    update public.fogon_problems set unread_owner = false, status = case when status = 'open' then 'seen' else status end where id = p_problem;
  end if;
end $$;
revoke execute on function public.fogon_problem_seen(uuid) from public, anon;
grant execute on function public.fogon_problem_seen(uuid) to authenticated;

-- en vivo: a Gonza le llegan los reportes nuevos y a cada uno las respuestas
do $$ begin
  alter publication supabase_realtime add table public.fogon_problem_msgs;
exception when duplicate_object then null; end $$;
