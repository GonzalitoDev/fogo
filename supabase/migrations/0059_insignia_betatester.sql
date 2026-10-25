-- Insignia nueva: Beta tester (la da el admin desde el perfil).
alter table public.fogon_badges drop constraint if exists fogon_badges_badge_check;
alter table public.fogon_badges add constraint fogon_badges_badge_check
  check (badge = any (array['fundador', 'staff', 'moderador', 'cazabugs', 'dev', 'artista', 'vip', 'embajador', 'betatester']));
