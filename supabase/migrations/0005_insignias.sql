-- Insignias al estilo Discord. Las da y las saca solo el admin de Fogón; todos las ven.

create table public.fogon_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.fogon_admins enable row level security;
revoke all on public.fogon_admins from anon, authenticated;
grant select on public.fogon_admins to authenticated;
create policy fogon_admins_self on public.fogon_admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.fogon_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.fogon_is_admin() from public, anon;
grant execute on function public.fogon_is_admin() to authenticated;

create table public.fogon_badges (
  user_id uuid not null references public.fogon_profiles(id) on delete cascade,
  badge text not null check (badge in ('fundador', 'staff', 'moderador', 'cazabugs', 'dev', 'artista', 'vip')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (user_id, badge)
);
alter table public.fogon_badges enable row level security;
revoke all on public.fogon_badges from anon;
create policy fogon_badges_select on public.fogon_badges for select to authenticated using (true);
create policy fogon_badges_insert on public.fogon_badges for insert to authenticated with check (public.fogon_is_admin());
create policy fogon_badges_delete on public.fogon_badges for delete to authenticated using (public.fogon_is_admin());
revoke update on public.fogon_badges from authenticated;

alter publication supabase_realtime add table public.fogon_badges;

-- el admin: solo willirexpilowey@gmail.com. La insignia de creador va a las cuentas de Gonza.
insert into public.fogon_admins (user_id) select id from auth.users where lower(email) = 'willirexpilowey@gmail.com' on conflict do nothing;
insert into public.fogon_badges (user_id, badge, granted_by)
select p.id, 'fundador', p.id from public.fogon_profiles p join auth.users u on u.id = p.id
where lower(u.email) in ('willirexpilowey@gmail.com', 'willirexpilowey+fogon@gmail.com') on conflict do nothing;
