-- El admin (gonza) le da o le saca Fogón Premium a quien quiera desde el perfil (sección Admin).
-- Al darlo, le llega un aviso por el hilo oficial.

insert into public.fogon_admins (user_id) values ('e7809edc-8559-4df6-8d2b-1fffc7a27719') on conflict do nothing;

create or replace function public.fogon_set_premium(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare was boolean;
begin
  if not public.fogon_is_admin() then raise exception 'Solo un admin de Fogón puede dar Premium.'; end if;
  select premium into was from public.fogon_profiles where id = p_user and not is_bot;
  if was is null then raise exception 'Esa cuenta no existe o es un bot.'; end if;
  if was = p_on then return; end if;
  if p_on then
    update public.fogon_profiles set premium = true where id = p_user;
    perform public.fogon_official_send(p_user,
      '🎁 **¡Te regalaron Fogón Premium!** 💎' || chr(10) || chr(10) ||
      'Ya podés personalizar tu nombre con colores, ponerle una decoración a tu avatar, sumarle un efecto a tu perfil y elegir un tema para la app.' || chr(10) ||
      'Entrá a ⚙️ Ajustes → Premium ✨ para estrenarlo. ¡Disfrutalo, {nombre}!');
  else
    update public.fogon_profiles set premium = false,
      name_style = null, name_c1 = null, name_c2 = null, avatar_deco = null, profile_effect = null, app_theme = null, app_accent = null
    where id = p_user;
  end if;
end $$;
revoke execute on function public.fogon_set_premium(uuid, boolean) from public, anon;
grant execute on function public.fogon_set_premium(uuid, boolean) to authenticated;
