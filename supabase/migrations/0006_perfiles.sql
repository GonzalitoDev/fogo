-- Perfiles al estilo Discord: foto, banner, colores de tema, pronombres, "sobre mí", estado y estado personalizado.

alter table public.fogon_profiles
  add column bio text not null default '' check (length(bio) <= 190),
  add column pronouns text not null default '' check (length(pronouns) <= 40),
  add column banner_color text check (banner_color ~ '^#[0-9a-fA-F]{6}$'),
  add column theme_top text check (theme_top ~ '^#[0-9a-fA-F]{6}$'),
  add column theme_bottom text check (theme_bottom ~ '^#[0-9a-fA-F]{6}$'),
  add column avatar_path text check (avatar_path is null or (avatar_path like id::text || '/%' and length(avatar_path) < 200)),
  add column banner_path text check (banner_path is null or (banner_path like id::text || '/%' and length(banner_path) < 200)),
  add column status text not null default 'online' check (status in ('online', 'idle', 'dnd', 'invisible')),
  add column custom_status text not null default '' check (length(custom_status) <= 128);

grant update (display_name, color, bio, pronouns, banner_color, theme_top, theme_bottom, avatar_path, banner_path, status, custom_status)
  on public.fogon_profiles to authenticated;

-- los cambios de perfil (foto, estado) llegan en vivo
alter publication supabase_realtime add table public.fogon_profiles;

-- fotos y banners: bucket público, cada uno escribe solo en su carpeta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fogon-profiles', 'fogon-profiles', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy fogon_profiles_media_select on storage.objects for select to authenticated using (
  bucket_id = 'fogon-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy fogon_profiles_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'fogon-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy fogon_profiles_media_update on storage.objects for update to authenticated using (
  bucket_id = 'fogon-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy fogon_profiles_media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'fogon-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text
);
