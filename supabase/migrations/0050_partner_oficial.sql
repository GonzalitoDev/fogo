-- La Comunidad de Fogón es la partner oficial: insignia, boosts al máximo (Nivel 3) y el logo
-- dentro de los boosts. Los boosts "de verdad" se siguen sumando, pero nunca baja del máximo
-- porque el boost oficial es de Fogón.

alter table public.fogon_servers add column if not exists is_partner boolean not null default false;

update public.fogon_servers
set is_official = true,
    is_partner = true,
    is_public = true,
    boost_count = 14,
    banner_color = coalesce(nullif(banner_color, ''), '#f2803a'),
    invite_vanity = true
where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2';

create or replace function public.fogon_boost_recount(p_server uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; ofi boolean;
begin
  if p_server is null then return 0; end if;
  select count(*) into n from public.fogon_boosts b join public.fogon_profiles p on p.id = b.user_id and p.premium
  where b.server_id = p_server;
  select coalesce(is_official, false) into ofi from public.fogon_servers where id = p_server;
  if ofi then n := greatest(n, 14); end if;
  update public.fogon_servers set boost_count = n,
    invite_code = case when invite_vanity and public.fogon_boost_level(n) < 3 then substr(md5(gen_random_uuid()::text), 1, 10) else invite_code end,
    invite_vanity = invite_vanity and public.fogon_boost_level(n) >= 3
  where id = p_server and boost_count is distinct from n;
  return n;
end $$;
revoke execute on function public.fogon_boost_recount(uuid) from public, anon, authenticated;

-- El directorio ahora también dice si es partner (para la insignia).
drop function if exists public.fogon_discover(text, text);
create function public.fogon_discover(p_q text default null, p_tag text default null)
returns table (
  id uuid, name text, icon_url text, description text, tags text[],
  members bigint, boosts integer, official boolean, partner boolean, invite_code text, already_member boolean
) language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.icon_url, s.description, s.tags,
         (select count(*) from public.fogon_members m where m.server_id = s.id),
         coalesce(s.boost_count, 0), s.is_official, s.is_partner, s.invite_code,
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
  order by s.is_official desc, s.is_partner desc, (select count(*) from public.fogon_members m where m.server_id = s.id) desc, s.name
  limit 60;
$$;
revoke execute on function public.fogon_discover(text, text) from public, anon;
grant execute on function public.fogon_discover(text, text) to authenticated;
