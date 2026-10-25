-- Emojis propios por servidor (como Discord). Se escriben como <:nombre:id> (o <a:nombre:id> si es GIF).
-- Los sube quien tenga "Administrar emojis". Límite según el nivel de boost: 50 / 100 / 150 / 250.

create table if not exists public.fogon_emojis (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.fogon_servers (id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9_]{2,32}$'),
  path text not null,
  animated boolean not null default false,
  created_by uuid references public.fogon_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (path ~ '^[0-9a-f-]{36}/emoji-[0-9]+\.(webp|gif|png)$')
);
create unique index if not exists fogon_emojis_name on public.fogon_emojis (server_id, lower(name));

alter table public.fogon_emojis enable row level security;
revoke all on public.fogon_emojis from anon, authenticated;
grant select, delete on public.fogon_emojis to authenticated;
grant insert (server_id, name, path, animated, created_by) on public.fogon_emojis to authenticated;
grant update (name) on public.fogon_emojis to authenticated;
-- verlos: cualquiera con sesión (así se ven en mensajes de cualquier lado)
create policy fogon_emojis_select on public.fogon_emojis for select to authenticated using (true);
create policy fogon_emojis_insert on public.fogon_emojis for insert to authenticated
  with check (created_by = (select auth.uid()) and public.fogon_has_perm(server_id, 'manage_emojis') and split_part(path, '/', 1) = (select auth.uid())::text);
create policy fogon_emojis_update on public.fogon_emojis for update to authenticated
  using (public.fogon_has_perm(server_id, 'manage_emojis')) with check (public.fogon_has_perm(server_id, 'manage_emojis'));
create policy fogon_emojis_delete on public.fogon_emojis for delete to authenticated using (public.fogon_has_perm(server_id, 'manage_emojis'));

do $$ begin
  alter publication supabase_realtime add table public.fogon_emojis;
exception when duplicate_object then null; end $$;

create or replace function public.fogon_emoji_limit(p_server uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case public.fogon_boost_level(coalesce(boost_count, 0)) when 3 then 250 when 2 then 150 when 1 then 100 else 50 end
  from public.fogon_servers where id = p_server
$$;
revoke execute on function public.fogon_emoji_limit(uuid) from public, anon;
grant execute on function public.fogon_emoji_limit(uuid) to authenticated;

create or replace function public.fogon_emojis_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('fogon_emojis:' || new.server_id::text));
    if (select count(*) from public.fogon_emojis where server_id = new.server_id) >= public.fogon_emoji_limit(new.server_id) then
      raise exception 'Este servidor ya llegó al máximo de emojis (%). Con más boosts se pueden subir más.', public.fogon_emoji_limit(new.server_id);
    end if;
    new.animated := new.path like '%.gif';
    new.created_at := now();
  else
    new.server_id := old.server_id; new.path := old.path; new.animated := old.animated; new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.fogon_emojis_guard() from public, anon, authenticated;
create or replace trigger fogon_emojis_guard before insert or update on public.fogon_emojis for each row execute function public.fogon_emojis_guard();

-- auditoría
create or replace function public.fogon_audit_emoji()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_op = 'UPDATE' and old.name = new.name then return null; end if;
  perform public.fogon_audit_add(r.server_id, 'emoji_' || lower(tg_op), 'emoji', r.id::text, r.name,
    case when tg_op = 'UPDATE' then jsonb_build_object('nombre', jsonb_build_array(old.name, new.name)) else '{}' end);
  return null;
end $$;
revoke execute on function public.fogon_audit_emoji() from public, anon, authenticated;
create or replace trigger fogon_audit after insert or update or delete on public.fogon_emojis for each row execute function public.fogon_audit_emoji();

-- reacciones con emojis propios
alter table public.fogon_reactions drop constraint if exists fogon_reactions_emoji_check;
alter table public.fogon_reactions add constraint fogon_reactions_emoji_check
  check ((length(emoji) between 1 and 16) or emoji ~ '^<a?:[A-Za-z0-9_]{2,32}:[0-9a-f-]{36}>$');
