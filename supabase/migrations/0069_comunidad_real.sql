-- ============================================================
-- Comunidad Real de Fogón: un servidor LIMPIO, sin bots,
-- para que se una gente de verdad (por invitación o al registrarse).
-- Los bots se quedan en la "Comunidad de Fogón" original.
-- ============================================================

-- 1) El servidor. (Cambiá el nombre o el código de invitación acá si querés.)
insert into public.fogon_servers (id, name, owner_id, invite_code)
values ('b56307db-6dfc-5a65-88a3-486d38ec17c3', 'Comunidad Real de Fogón', 'e7809edc-8559-4df6-8d2b-1fffc7a27719', 'real')
on conflict (id) do nothing;

-- 2) El dueño entra como miembro.
insert into public.fogon_members (server_id, user_id, joined_at)
values ('b56307db-6dfc-5a65-88a3-486d38ec17c3', 'e7809edc-8559-4df6-8d2b-1fffc7a27719', now())
on conflict do nothing;

-- 3) Categorías y canales (sin bots, sin historial falso).
insert into public.fogon_channels (id, server_id, kind, name, position) values
  ('cbb18bd2-8f0b-5bb8-b1ca-2d32d1aa57b6', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'category', 'BIENVENIDA', 0),
  ('ce33db97-61b8-5516-b5c3-106a351947a0', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'category', 'CHARLA', 1)
on conflict (id) do nothing;

insert into public.fogon_channels (id, server_id, kind, name, topic, parent_id, position) values
  ('cc962bfd-d9e5-5682-b3e9-7cb4ea3c354f', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'text', 'bienvenida', 'Leé esto antes de escribir 🔥', 'cbb18bd2-8f0b-5bb8-b1ca-2d32d1aa57b6', 0),
  ('cd58a035-f39d-5f53-8822-696ae155f653', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'text', 'anuncios', 'Novedades de la comunidad', 'cbb18bd2-8f0b-5bb8-b1ca-2d32d1aa57b6', 1),
  ('cf06e7df-d375-5f45-8bbf-802ccfde99b7', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'text', 'general', 'Para charlar de todo', 'ce33db97-61b8-5516-b5c3-106a351947a0', 0),
  ('d0a9f893-d55d-5eea-bb0b-602e17d616a3', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'text', 'memes', 'Solo memes de calidad (o no)', 'ce33db97-61b8-5516-b5c3-106a351947a0', 1),
  ('d1a306e2-5906-5cf0-ab03-da9af6a13469', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'text', 'música', 'Qué estás escuchando', 'ce33db97-61b8-5516-b5c3-106a351947a0', 2)
on conflict (id) do nothing;

-- 4) Rol por defecto para los que se unen.
insert into public.fogon_roles (id, server_id, name, color, position, hoist, perms, auto_assign)
values ('d28e497c-1084-5550-8bbb-59dd3a7e7fb2', 'b56307db-6dfc-5a65-88a3-486d38ec17c3', 'Miembros', '#4f9d69', 1, false, '{}', true)
on conflict (id) do nothing;

-- 5) Mensaje de bienvenida fijado (del dueño, no de un bot).
alter table public.fogon_messages disable trigger fogon_messages_before;
insert into public.fogon_messages (id, channel_id, author_id, content, created_at, pinned_at, pinned_by)
select gen_random_uuid(), 'cc962bfd-d9e5-5682-b3e9-7cb4ea3c354f', 'e7809edc-8559-4df6-8d2b-1fffc7a27719',
       E'# Bienvenide a la Comunidad Real de Fogón 🔥\n\nAcá no hay bots: todos los que ves son personas de verdad.\n\n**Reglas:**\n1. Respeto ante todo. Nada de insultos ni discriminación.\n2. Nada de spam ni publicidad.\n3. Cada tema en su canal.\n4. Pasala bien 🧉',
       now(), now(), 'e7809edc-8559-4df6-8d2b-1fffc7a27719'
where not exists (select 1 from public.fogon_messages where channel_id = 'cc962bfd-d9e5-5682-b3e9-7cb4ea3c354f');
alter table public.fogon_messages enable trigger fogon_messages_before;

-- 6) La gente que se registra entra sola a esta comunidad (además de la de bots).
create or replace function public.fogon_join_real_community()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_bot then return new; end if;
  insert into public.fogon_members (server_id, user_id)
  values ('b56307db-6dfc-5a65-88a3-486d38ec17c3', new.id) on conflict do nothing;
  insert into public.fogon_member_roles (server_id, user_id, role_id)
  select 'b56307db-6dfc-5a65-88a3-486d38ec17c3', new.id, r.id
  from public.fogon_roles r where r.server_id = 'b56307db-6dfc-5a65-88a3-486d38ec17c3' and r.auto_assign
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists fogon_join_real_community on public.fogon_profiles;
create trigger fogon_join_real_community after insert on public.fogon_profiles
  for each row execute function public.fogon_join_real_community();
revoke execute on function public.fogon_join_real_community() from public, anon, authenticated;
