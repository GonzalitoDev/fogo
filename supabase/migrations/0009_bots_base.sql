-- Perfiles de bots (sin cuenta de Auth). Las personas siguen necesitando una cuenta real.
alter table public.fogon_profiles add column is_bot boolean not null default false;
alter table public.fogon_profiles drop constraint fogon_profiles_id_fkey;

create or replace function public.fogon_profiles_auth_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_bot and not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'El perfil tiene que ser de una cuenta real';
  end if;
  return new;
end $$;
create trigger fogon_profiles_auth_check before insert or update of id, is_bot on public.fogon_profiles
  for each row execute function public.fogon_profiles_auth_check();
revoke execute on function public.fogon_profiles_auth_check() from public, anon, authenticated;

-- nadie se puede crear un perfil de bot desde la app
alter policy fogon_profiles_insert on public.fogon_profiles with check (id = (select auth.uid()) and not is_bot);
