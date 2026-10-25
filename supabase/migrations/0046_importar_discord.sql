-- Importar plantillas reales de Discord (discord.new/XXXX o discord.com/template/XXXX).
-- El servidor de Fogón descarga la plantilla, la mapea a nuestras categorías/canales/roles y la aplica.

create extension if not exists pg_net with schema extensions;

-- Aplica una estructura ya normalizada (la misma forma que usan las plantillas de Fogón).
create or replace function public.fogon_apply_structure(p_server uuid, p_structure jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  st jsonb := coalesce(p_structure, '{}'::jsonb);
  ro jsonb; cat jsonb; ch jsonb; cat_id uuid;
  n int := 0; n_roles int := 0; n_canales int := 0;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para usar plantillas'; end if;
  if not public.fogon_has_perm(p_server, 'manage_server') then raise exception 'No tenés permiso para cambiar este servidor'; end if;
  if jsonb_typeof(st) <> 'object' then raise exception 'Plantilla inválida'; end if;

  for ro in select * from jsonb_array_elements(coalesce(st->'roles', '[]'::jsonb)) loop
    exit when n_roles >= 100;
    if btrim(coalesce(ro->>'name', '')) = '' then continue; end if;
    insert into public.fogon_roles (server_id, name, color, position, hoist, perms, auto_assign)
    values (p_server,
            left(btrim(ro->>'name'), 50),
            case when coalesce(ro->>'color', '') ~ '^#[0-9a-fA-F]{6}$' then ro->>'color' else '#99a8a4' end,
            least(greatest(coalesce((ro->>'position')::int, 1), 1), 999),
            coalesce((ro->>'hoist')::boolean, true),
            coalesce((select array_agg(distinct x) from jsonb_array_elements_text(coalesce(ro->'perms', '[]'::jsonb)) x where x = any(public.fogon_all_perms())), '{}'),
            coalesce((ro->>'auto_assign')::boolean, false));
    n := n + 1;
    n_roles := n_roles + 1;
  end loop;

  for cat in select * from jsonb_array_elements(coalesce(st->'categories', '[]'::jsonb)) loop
    exit when n_canales >= 150;
    if btrim(coalesce(cat->>'name', '')) = '' then continue; end if;
    insert into public.fogon_channels (server_id, kind, name, position)
    values (p_server, 'category', left(btrim(cat->>'name'), 100), coalesce((cat->>'position')::int, 0))
    returning id into cat_id;
    n := n + 1;
    for ch in select * from jsonb_array_elements(coalesce(cat->'channels', '[]'::jsonb)) loop
      exit when n_canales >= 150;
      if btrim(coalesce(ch->>'name', '')) = '' then continue; end if;
      insert into public.fogon_channels (server_id, kind, name, topic, parent_id, position)
      values (p_server,
              case when ch->>'kind' = 'voice' then 'voice' else 'text' end,
              left(btrim(ch->>'name'), 100),
              left(coalesce(ch->>'topic', ''), 500),
              cat_id,
              coalesce((ch->>'position')::int, 0));
      n := n + 1;
      n_canales := n_canales + 1;
    end loop;
  end loop;

  for ch in select * from jsonb_array_elements(coalesce(st->'loose', '[]'::jsonb)) loop
    exit when n_canales >= 150;
    if btrim(coalesce(ch->>'name', '')) = '' then continue; end if;
    insert into public.fogon_channels (server_id, kind, name, topic, parent_id, position)
    values (p_server,
            case when ch->>'kind' = 'voice' then 'voice' else 'text' end,
            left(btrim(ch->>'name'), 100),
            left(coalesce(ch->>'topic', ''), 500),
            null,
            coalesce((ch->>'position')::int, 0));
    n := n + 1;
    n_canales := n_canales + 1;
  end loop;

  return n;
end $$;
revoke execute on function public.fogon_apply_structure(uuid, jsonb) from public, anon;
grant execute on function public.fogon_apply_structure(uuid, jsonb) to authenticated;

-- Las plantillas de Fogón ahora también pasan por la misma función.
create or replace function public.fogon_apply_template(p_server uuid, p_template text)
returns integer language plpgsql security definer set search_path = '' as $$
declare st jsonb;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para usar plantillas'; end if;
  if not public.fogon_has_perm(p_server, 'manage_server') then raise exception 'No tenés permiso para cambiar este servidor'; end if;
  select structure into st from public.fogon_server_templates where id = p_template;
  if st is null then raise exception 'Esa plantilla no existe'; end if;
  return public.fogon_apply_structure(p_server, st);
end $$;
revoke execute on function public.fogon_apply_template(uuid, text) from public, anon;
grant execute on function public.fogon_apply_template(uuid, text) to authenticated;

-- Crear un servidor nuevo directo con una estructura (el #general por defecto se reemplaza).
create or replace function public.fogon_create_server_with_structure(p_name text, p_structure jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  sid := public.fogon_create_server(p_name);
  delete from public.fogon_channels c
  where c.server_id = sid and c.kind = 'text' and c.name = 'general'
    and not exists (select 1 from public.fogon_messages m where m.channel_id = c.id);
  delete from public.fogon_channels c
  where c.server_id = sid and c.kind = 'category' and c.name = 'Canales de texto'
    and not exists (select 1 from public.fogon_channels ch where ch.parent_id = c.id);
  perform public.fogon_apply_structure(sid, p_structure);
  return sid;
end $$;
revoke execute on function public.fogon_create_server_with_structure(text, jsonb) from public, anon;
grant execute on function public.fogon_create_server_with_structure(text, jsonb) to authenticated;

-- Trae la plantilla real desde Discord (sin API key) y devuelve su JSON.
create or replace function public.fogon_discord_template(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  code text;
  req bigint;
  st int;
  body text;
  i int;
  j jsonb;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para importar de Discord'; end if;
  code := btrim(coalesce(p_code, ''));
  code := regexp_replace(code, '^.*discord\.new/', '');
  code := regexp_replace(code, '^.*discord\.com/template/', '');
  code := split_part(split_part(code, '?', 1), '/', 1);
  if code !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'Poné un link de plantilla de Discord válido (discord.new/…)'; end if;

  delete from net._http_response where created < now() - interval '10 minutes';
  req := net.http_get(url := 'https://discord.com/api/v10/guilds/templates/' || code, timeout_milliseconds := 8000);
  for i in 1..40 loop
    select status_code, content into st, body from net._http_response where id = req;
    exit when st is not null;
    perform pg_sleep(0.2);
  end loop;
  if st is null then raise exception 'Discord no contestó a tiempo, probá de nuevo'; end if;
  if st = 404 then raise exception 'Esa plantilla no existe o es privada'; end if;
  if st = 429 then raise exception 'Discord nos pidió esperar un rato; probá en unos minutos'; end if;
  if st <> 200 then raise exception 'Discord respondió con error %', st; end if;

  begin
    j := body::jsonb;
  exception when others then
    raise exception 'Discord devolvió algo raro, probá de nuevo';
  end;
  if not (j ? 'serialized_source_guild') then raise exception 'Esa plantilla no tiene canales para importar'; end if;
  return j;
end $$;
revoke execute on function public.fogon_discord_template(text) from public, anon;
grant execute on function public.fogon_discord_template(text) to authenticated;
