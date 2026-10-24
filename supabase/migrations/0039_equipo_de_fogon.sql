-- Equipo de Fogón: gonza suma (o saca) gente que administra la comunidad.
-- Cada miembro del equipo: es admin de Fogón (insignias y Premium), tiene la insignia
-- "Equipo de Fogón" y el rol "Equipo de Fogón" con todos los permisos en la Comunidad de Fogón.
-- Banear cuentas y mandar avisos oficiales sigue siendo solo de gonza.

-- los admins ven quién más es admin
drop policy if exists fogon_admins_self on public.fogon_admins;
create policy fogon_admins_select on public.fogon_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.fogon_is_admin());
alter publication supabase_realtime add table public.fogon_admins;

-- rol del equipo en la comunidad (arriba de todo, menos el de Sofi)
insert into public.fogon_roles (id, server_id, name, color, position, hoist, perms)
values ('7c1d1f00-0000-4000-8000-00000000e001', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Equipo de Fogón', '#f2803a', 18, true,
        array['manage_server', 'manage_channels', 'manage_roles', 'manage_messages', 'kick_members', 'ban_members', 'mention_everyone'])
on conflict (id) do nothing;

create or replace function public.fogon_set_staff(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := 'e7809edc-8559-4df6-8d2b-1fffc7a27719';
  community uuid := 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
  staff_role uuid := '7c1d1f00-0000-4000-8000-00000000e001';
  v_bot boolean;
begin
  if auth.uid() is distinct from owner then raise exception 'Solo @gonza puede armar el Equipo de Fogón.'; end if;
  if p_user = owner then raise exception 'Vos sos el dueño: siempre estás en el equipo.'; end if;
  select is_bot into v_bot from public.fogon_profiles where id = p_user;
  if v_bot is null then raise exception 'Esa cuenta no existe.'; end if;
  if v_bot then raise exception 'Los bots no pueden estar en el equipo.'; end if;
  if public.fogon_is_account_banned(p_user) then raise exception 'Esa cuenta está baneada.'; end if;

  if p_on then
    if exists (select 1 from public.fogon_admins where user_id = p_user) then return; end if;
    insert into public.fogon_admins (user_id) values (p_user) on conflict do nothing;
    insert into public.fogon_badges (user_id, badge, granted_by) values (p_user, 'staff', owner) on conflict do nothing;
    insert into public.fogon_members (server_id, user_id) values (community, p_user) on conflict do nothing;
    insert into public.fogon_member_roles (server_id, user_id, role_id) values (community, p_user, staff_role) on conflict do nothing;
    perform public.fogon_official_send(p_user,
      '🛡️ **¡Ahora sos parte del Equipo de Fogón!**' || chr(10) || chr(10) ||
      'Te sumamos para ayudar a administrar la comunidad. Ya tenés:' || chr(10) ||
      '• El rol **Equipo de Fogón** con todos los permisos en la Comunidad de Fogón (canales, roles, mensajes, expulsar y banear del servidor).' || chr(10) ||
      '• La sección **Admin** en los perfiles: insignias y Fogón Premium.' || chr(10) ||
      '• La insignia **Equipo de Fogón** en tu perfil.' || chr(10) || chr(10) ||
      'Usalo con cuidado, {nombre}. ¡Gracias por sumarte! 🔥');
  else
    delete from public.fogon_admins where user_id = p_user;
    delete from public.fogon_badges where user_id = p_user and badge = 'staff';
    delete from public.fogon_member_roles where server_id = community and user_id = p_user and role_id = staff_role;
  end if;
end $$;
revoke execute on function public.fogon_set_staff(uuid, boolean) from public, anon;
grant execute on function public.fogon_set_staff(uuid, boolean) to authenticated;
