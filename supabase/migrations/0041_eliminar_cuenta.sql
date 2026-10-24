-- Eliminar cuenta (como en Discord): el perfil queda como "Usuario eliminado" para que las charlas
-- de los demás no pierdan sentido, se sale de todo y se borra el acceso. Los servidores propios
-- pasan al miembro de más rango (o el más antiguo); si no queda nadie, se borran.
-- La cuenta del dueño de Fogón no se puede eliminar.

alter table public.fogon_profiles add column if not exists deleted_at timestamptz;

create or replace function public.fogon_delete_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  s record; heir uuid;
begin
  if me is null then raise exception 'Tenés que iniciar sesión'; end if;
  if me = 'e7809edc-8559-4df6-8d2b-1fffc7a27719'::uuid then raise exception 'La cuenta del dueño de Fogón no se puede eliminar.'; end if;
  if not exists (select 1 from public.fogon_profiles where id = me and deleted_at is null) then raise exception 'Esta cuenta ya no existe.'; end if;

  -- servidores propios: pasan a otra persona o se borran
  for s in select id, name from public.fogon_servers where owner_id = me loop
    select m.user_id into heir
    from public.fogon_members m
    join public.fogon_profiles p on p.id = m.user_id and not p.is_bot and p.deleted_at is null
    left join public.fogon_member_roles mr on mr.server_id = m.server_id and mr.user_id = m.user_id
    left join public.fogon_roles r on r.id = mr.role_id
    where m.server_id = s.id and m.user_id <> me
    group by m.user_id, m.joined_at
    order by max(coalesce(r.position, -1)) desc, m.joined_at
    limit 1;
    if heir is null then
      delete from public.fogon_servers where id = s.id;
    else
      update public.fogon_servers set owner_id = heir where id = s.id;
      perform public.fogon_official_send(heir,
        '👑 Ahora sos dueño de **' || s.name || '**: la persona que lo creó eliminó su cuenta y el servidor pasó a vos.');
    end if;
  end loop;

  -- sale de todo
  delete from public.fogon_member_roles where user_id = me;
  delete from public.fogon_members where user_id = me;
  delete from public.fogon_friends where requester = me or addressee = me;
  delete from public.fogon_blocks where blocker = me or blocked = me;
  delete from public.fogon_badges where user_id = me;
  delete from public.fogon_boosts where user_id = me;
  delete from public.fogon_read_states where user_id = me;
  delete from public.fogon_admins where user_id = me;

  -- perfil anónimo (los mensajes viejos quedan como "Usuario eliminado")
  update public.fogon_profiles set
    username = 'eliminado_' || substr(md5(me::text), 1, 10),
    display_name = 'Usuario eliminado', color = '#5d6067', bio = '', pronouns = '', custom_status = '', status = 'invisible',
    avatar_path = null, banner_path = null, banner_color = null, theme_top = null, theme_bottom = null,
    premium = false, name_style = null, name_c1 = null, name_c2 = null, avatar_deco = null, profile_effect = null, app_theme = null, app_accent = null,
    deleted_at = now()
  where id = me;

  -- acceso: se cierra todo; si la cuenta no se usa en otra app del proyecto (Temazo), se borra
  delete from auth.sessions where user_id = me;
  update auth.refresh_tokens set revoked = true where user_id = me::text;
  if to_regclass('public.temazo_profiles') is null or not exists (select 1 from public.temazo_profiles where id = me) then
    delete from auth.users where id = me;
  end if;
end $$;
revoke execute on function public.fogon_delete_account() from public, anon;
grant execute on function public.fogon_delete_account() to authenticated;
