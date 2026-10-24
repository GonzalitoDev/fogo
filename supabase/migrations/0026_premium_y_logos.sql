-- Fogón Premium (lo tiene el dueño) + logos de servidor (la Comunidad de Fogón estrena el suyo).

alter table public.fogon_profiles add column if not exists premium boolean not null default false;
alter table public.fogon_profiles add column if not exists name_style text check (name_style in ('gradiente', 'brillo', 'arcoiris'));
alter table public.fogon_profiles add column if not exists name_c1 text check (name_c1 ~ '^#[0-9a-fA-F]{6}$');
alter table public.fogon_profiles add column if not exists name_c2 text check (name_c2 ~ '^#[0-9a-fA-F]{6}$');
alter table public.fogon_profiles add column if not exists avatar_deco text check (avatar_deco in ('fuego', 'corona', 'neon', 'corazones', 'estrellas', 'hojas'));
alter table public.fogon_profiles add column if not exists profile_effect text check (profile_effect in ('chispas', 'nieve', 'corazones', 'brasas', 'estrellas'));
alter table public.fogon_profiles add column if not exists app_theme text check (app_theme in ('medianoche', 'atardecer', 'aurora', 'fogon', 'rosa', 'oceano', 'bosque'));
alter table public.fogon_profiles add column if not exists app_accent text check (app_accent ~ '^#[0-9a-fA-F]{6}$');

-- cada uno tunea lo suyo; "premium" no se puede tocar desde la app
grant update (name_style, name_c1, name_c2, avatar_deco, profile_effect, app_theme, app_accent) on public.fogon_profiles to authenticated;

-- desde la app (rol authenticated): nadie se da Premium ni se marca como bot, y sin Premium los extras quedan vacíos
create or replace function public.fogon_profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.premium := false;
      new.is_bot := false;
    else
      new.premium := old.premium;
      new.is_bot := old.is_bot;
    end if;
    if not new.premium then
      new.name_style := null; new.name_c1 := null; new.name_c2 := null;
      new.avatar_deco := null; new.profile_effect := null; new.app_theme := null; new.app_accent := null;
    end if;
  end if;
  return new;
end $$;
create or replace trigger fogon_profiles_guard before insert or update on public.fogon_profiles for each row execute function public.fogon_profiles_guard();

-- el dueño de Fogón tiene Premium, con un estilo de arranque
update public.fogon_profiles set premium = true,
  name_style = coalesce(name_style, 'gradiente'), name_c1 = coalesce(name_c1, '#ff8a3d'), name_c2 = coalesce(name_c2, '#ffd166'),
  avatar_deco = coalesce(avatar_deco, 'fuego'), profile_effect = coalesce(profile_effect, 'brasas')
where id = (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2');

/* ---------- logos de servidor ---------- */

alter table public.fogon_servers add column if not exists icon_url text
  check (icon_url is null or icon_url ~ '^(/logos/[a-z0-9-]+\.svg|https://xfwolaurpeofysnymqle\.supabase\.co/storage/v1/object/public/fogon-profiles/[0-9a-f-]+/server-[^/]+)$');
grant update (icon_url) on public.fogon_servers to authenticated;

update public.fogon_servers set icon_url = '/logos/comunidad-fogon.svg' where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2';
update public.fogon_servers set icon_url = '/logos/privado.svg' where id = '7c1d1f00-0000-4000-8000-00000000ce01';

insert into public.fogon_bot_lines (tag, body) values
  ('cm_anuncio', '📣 ¡La comunidad estrena **logo**! 🔥 Lo ven en la barra de la izquierda. ¿Qué les parece?');
