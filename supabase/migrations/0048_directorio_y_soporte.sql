-- Directorio público de comunidades + soporte con IA.
-- Los servidores se publican con nombre, descripción y tags; se buscan desde el cliente por RPC
-- (security definer), así no se filtran filas de servidores a los que no pertenecés.

alter table public.fogon_servers
  add column if not exists is_public boolean not null default false,
  add column if not exists is_official boolean not null default false,
  add column if not exists description text not null default '',
  add column if not exists tags text[] not null default '{}';

alter table public.fogon_servers drop constraint if exists fogon_servers_description_check;
alter table public.fogon_servers add constraint fogon_servers_description_check check (length(description) <= 600);
alter table public.fogon_servers drop constraint if exists fogon_servers_tags_check;
alter table public.fogon_servers add constraint fogon_servers_tags_check check (array_length(tags, 1) is null or array_length(tags, 1) <= 8);

-- La Comunidad de Fogón es la comunidad oficial y aparece primera en el directorio.
update public.fogon_servers
set is_public = true,
    is_official = true,
    description = 'La comunidad oficial de Fogón: charla, voz, música y bots las 24 horas.',
    tags = array['oficial', 'comunidad', 'voz', 'música']
where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2';

-- Publicar / despublicar (solo quien administra el servidor).
create or replace function public.fogon_set_server_public(p_server uuid, p_public boolean, p_description text, p_tags text[])
returns void language plpgsql security definer set search_path = '' as $$
declare t text[];
begin
  if auth.uid() is null then raise exception 'Iniciá sesión'; end if;
  if not public.fogon_has_perm(p_server, 'manage_server') then raise exception 'No tenés permiso para cambiar este servidor'; end if;
  select coalesce(array_agg(distinct left(lower(btrim(x)), 20)), '{}') into t
  from unnest(coalesce(p_tags, '{}'::text[])) x
  where btrim(x) <> '' and left(lower(btrim(x)), 20) <> 'oficial';
  t := coalesce(t[1:8], '{}'::text[]);
  update public.fogon_servers
  set is_public = coalesce(p_public, false),
      description = left(btrim(coalesce(p_description, '')), 600),
      tags = t
  where id = p_server;
end $$;
revoke execute on function public.fogon_set_server_public(uuid, boolean, text, text[]) from public, anon;
grant execute on function public.fogon_set_server_public(uuid, boolean, text, text[]) to authenticated;

-- Buscador de comunidades públicas (nombre, descripción o tag).
create or replace function public.fogon_discover(p_q text default null, p_tag text default null)
returns table (
  id uuid, name text, icon_url text, description text, tags text[],
  members bigint, boosts integer, official boolean, invite_code text, already_member boolean
) language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.icon_url, s.description, s.tags,
         (select count(*) from public.fogon_members m where m.server_id = s.id),
         coalesce(s.boost_count, 0), s.is_official, s.invite_code,
         exists (select 1 from public.fogon_members m where m.server_id = s.id and m.user_id = auth.uid())
  from public.fogon_servers s
  where s.is_public
    and (
      p_q is null or btrim(p_q) = ''
      or s.name ilike '%' || btrim(p_q) || '%'
      or s.description ilike '%' || btrim(p_q) || '%'
      or exists (select 1 from unnest(s.tags) t where t ilike '%' || btrim(p_q) || '%')
    )
    and (p_tag is null or btrim(p_tag) = '' or btrim(p_tag) = any(s.tags))
  order by s.is_official desc, (select count(*) from public.fogon_members m where m.server_id = s.id) desc, s.name
  limit 60;
$$;
revoke execute on function public.fogon_discover(text, text) from public, anon;
grant execute on function public.fogon_discover(text, text) to authenticated;
