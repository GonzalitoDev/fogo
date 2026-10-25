-- Insignia "Partidario inicial" (como la Early Supporter de Discord): la ganan sola los que se hacen
-- Fogón Premium antes del 1/1/2027, y la conservan para siempre aunque después dejen Premium.
alter table public.fogon_badges drop constraint if exists fogon_badges_badge_check;
alter table public.fogon_badges add constraint fogon_badges_badge_check
  check (badge = any (array['fundador', 'staff', 'moderador', 'cazabugs', 'dev', 'artista', 'vip', 'embajador', 'betatester', 'partidario']));

create or replace function public.fogon_early_supporter()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.premium and not new.is_bot and now() < '2027-01-01T03:00:00Z'
     and (tg_op = 'INSERT' or not coalesce(old.premium, false)) then
    insert into public.fogon_badges (user_id, badge) values (new.id, 'partidario') on conflict do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.fogon_early_supporter() from public, anon, authenticated;
create or replace trigger fogon_early_supporter after insert or update of premium on public.fogon_profiles for each row execute function public.fogon_early_supporter();

insert into public.fogon_badges (user_id, badge)
select id, 'partidario' from public.fogon_profiles where premium and not is_bot
on conflict do nothing;
