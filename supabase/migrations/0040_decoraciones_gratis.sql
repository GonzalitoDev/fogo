-- Decoraciones de avatar gratis para todos (antes eran de Premium) y 14 nuevas.
alter table public.fogon_profiles drop constraint if exists fogon_profiles_avatar_deco_check;
alter table public.fogon_profiles add constraint fogon_profiles_avatar_deco_check check (avatar_deco = any (array[
  'fuego', 'corona', 'neon', 'corazones', 'estrellas', 'hojas',
  'fogata', 'mate', 'orejas_gato', 'aureola', 'cuernitos', 'auriculares', 'flores', 'rayos',
  'burbujas', 'nieve', 'arcoiris', 'petalos', 'pixel', 'galaxia']));

-- sin Premium ya no se borra la decoración
do $$
declare def text;
begin
  def := pg_get_functiondef('public.fogon_profiles_guard'::regproc);
  def := replace(def, 'new.avatar_deco := null; ', '');
  if position('new.avatar_deco := null' in def) > 0 then raise exception 'no pude ajustar fogon_profiles_guard'; end if;
  execute def;
  def := pg_get_functiondef('public.fogon_set_premium'::regproc);
  def := replace(def, 'avatar_deco = null, ', '');
  if position('avatar_deco = null' in def) > 0 then raise exception 'no pude ajustar fogon_set_premium'; end if;
  execute def;
end $$;
