-- Insignias nuevas (se dan a mano): Propietario de servidor asociado, Egresado del Programa de Moderadores, Eventos del Fogón.
alter table public.fogon_badges drop constraint if exists fogon_badges_badge_check;
alter table public.fogon_badges add constraint fogon_badges_badge_check
  check (badge = any (array['fundador', 'staff', 'moderador', 'cazabugs', 'dev', 'artista', 'vip', 'embajador', 'betatester', 'partidario', 'socio', 'exmod', 'eventos']));
