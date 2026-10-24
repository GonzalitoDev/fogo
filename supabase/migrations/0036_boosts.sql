-- Boosts de servidor (como los de Discord Nitro): cada cuenta con Fogón Premium tiene 2 boosts
-- para darle a los servidores que quiera. Con boosts el servidor sube de nivel y desbloquea mejoras:
--   Nivel 1 (2 boosts):  banner del servidor + voz a 96 kbps
--   Nivel 2 (7 boosts):  ícono con brillo + voz a 128 kbps
--   Nivel 3 (14 boosts): link de invitación personalizado + voz a 256 kbps

alter table public.fogon_servers add column if not exists boost_count integer not null default 0;
alter table public.fogon_servers add column if not exists banner_color text check (banner_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.fogon_servers add column if not exists invite_vanity boolean not null default false;

create table if not exists public.fogon_boosts (
  user_id uuid not null references public.fogon_profiles (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  server_id uuid references public.fogon_servers (id) on delete set null,
  boosted_at timestamptz,
  primary key (user_id, slot)
);
create index if not exists fogon_boosts_server on public.fogon_boosts (server_id);
alter table public.fogon_boosts enable row level security;
revoke all on public.fogon_boosts from anon, authenticated;
grant select on public.fogon_boosts to authenticated;
create policy fogon_boosts_select on public.fogon_boosts for select to authenticated using (true);
alter publication supabase_realtime add table public.fogon_boosts;

create or replace function public.fogon_boost_level(n integer)
returns integer language sql immutable set search_path = '' as $$
  select case when n >= 14 then 3 when n >= 7 then 2 when n >= 2 then 1 else 0 end
$$;

-- recuenta (solo cuentan los boosts de quien sigue con Premium); si baja de nivel 3, pierde el link propio
create or replace function public.fogon_boost_recount(p_server uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_server is null then return 0; end if;
  select count(*) into n from public.fogon_boosts b join public.fogon_profiles p on p.id = b.user_id and p.premium
  where b.server_id = p_server;
  update public.fogon_servers set boost_count = n,
    invite_code = case when invite_vanity and public.fogon_boost_level(n) < 3 then substr(md5(gen_random_uuid()::text), 1, 10) else invite_code end,
    invite_vanity = invite_vanity and public.fogon_boost_level(n) >= 3
  where id = p_server and boost_count is distinct from n;
  return n;
end $$;
revoke execute on function public.fogon_boost_recount(uuid) from public, anon, authenticated;

create or replace function public.fogon_boost(p_server uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_slot smallint; n integer; before_lvl integer; v_ch uuid;
begin
  if me is null then raise exception 'Tenés que iniciar sesión'; end if;
  if not exists (select 1 from public.fogon_profiles where id = me and premium) then
    raise exception 'Necesitás Fogón Premium para boostear un servidor.';
  end if;
  if not public.fogon_is_member(p_server) then raise exception 'Tenés que estar en el servidor para boostearlo.'; end if;
  insert into public.fogon_boosts (user_id, slot) values (me, 1), (me, 2) on conflict do nothing;
  select slot into v_slot from public.fogon_boosts where user_id = me and server_id is null order by slot limit 1 for update;
  if v_slot is null then raise exception 'Ya usaste tus 2 boosts. Sacá uno de otro servidor para pasarlo a este.'; end if;
  select boost_count into before_lvl from public.fogon_servers where id = p_server;
  before_lvl := public.fogon_boost_level(coalesce(before_lvl, 0));
  update public.fogon_boosts set server_id = p_server, boosted_at = now() where user_id = me and slot = v_slot;
  n := public.fogon_boost_recount(p_server);
  -- aviso en el chat del servidor, como en Discord
  select id into v_ch from public.fogon_channels where server_id = p_server and kind = 'text'
  order by (name = 'general') desc, position limit 1;
  if v_ch is not null then
    insert into public.fogon_messages (channel_id, author_id, content) values (v_ch, me,
      '💎 **¡Boosteé el servidor!** Ahora tiene ' || n || (case when n = 1 then ' boost' else ' boosts' end) ||
      case when public.fogon_boost_level(n) > before_lvl then ' y subió a **Nivel ' || public.fogon_boost_level(n) || '** 🎉' else '.' end);
  end if;
  return n;
end $$;
revoke execute on function public.fogon_boost(uuid) from public, anon;
grant execute on function public.fogon_boost(uuid) to authenticated;

create or replace function public.fogon_unboost(p_server uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); v_slot smallint;
begin
  select slot into v_slot from public.fogon_boosts where user_id = me and server_id = p_server order by boosted_at desc limit 1;
  if v_slot is null then raise exception 'No tenés boosts en este servidor.'; end if;
  update public.fogon_boosts set server_id = null, boosted_at = null where user_id = me and slot = v_slot;
  return public.fogon_boost_recount(p_server);
end $$;
revoke execute on function public.fogon_unboost(uuid) from public, anon;
grant execute on function public.fogon_unboost(uuid) to authenticated;

-- mejoras que elige el dueño: color del banner (nivel 1) y link propio (nivel 3)
create or replace function public.fogon_server_perks(p_server uuid, p_banner text, p_vanity text)
returns void language plpgsql security definer set search_path = '' as $$
declare lvl integer;
begin
  if not public.fogon_is_owner(p_server) then raise exception 'Solo el dueño puede cambiar esto.'; end if;
  select public.fogon_boost_level(boost_count) into lvl from public.fogon_servers where id = p_server;
  if p_banner is not null then
    if lvl < 1 then raise exception 'El banner se desbloquea en el Nivel 1 (2 boosts).'; end if;
    if p_banner !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color inválido.'; end if;
    update public.fogon_servers set banner_color = p_banner where id = p_server;
  end if;
  if p_vanity is not null then
    p_vanity := lower(btrim(p_vanity));
    if lvl < 3 then raise exception 'El link personalizado se desbloquea en el Nivel 3 (14 boosts).'; end if;
    if p_vanity !~ '^[a-z0-9]{3,20}$' then raise exception 'El link tiene que tener entre 3 y 20 letras o números, sin espacios.'; end if;
    if exists (select 1 from public.fogon_servers where invite_code = p_vanity and id <> p_server) then
      raise exception 'Ese link ya lo usa otro servidor.';
    end if;
    update public.fogon_servers set invite_code = p_vanity, invite_vanity = true where id = p_server;
  end if;
end $$;
revoke execute on function public.fogon_server_perks(uuid, text, text) from public, anon;
grant execute on function public.fogon_server_perks(uuid, text, text) to authenticated;

-- si alguien pierde Premium, sus boosts se liberan
do $$
declare def text := pg_get_functiondef('public.fogon_set_premium'::regproc);
begin
  def := replace(def, '    where id = p_user;
  end if;', '    where id = p_user;
    perform public.fogon_boost_recount(s) from (
      select b.server_id as s from public.fogon_boosts b where b.user_id = p_user and b.server_id is not null) x;
    update public.fogon_boosts set server_id = null, boosted_at = null where user_id = p_user;
  end if;');
  if position('fogon_boost_recount' in def) = 0 then raise exception 'no pude ajustar fogon_set_premium'; end if;
  execute def;
end $$;
