-- Plantillas de servidor: al crear uno elegís una y queda con categorías, canales y roles listos.
-- También se pueden aplicar a un servidor que ya existe (se agregan, no se borra nada).

create table if not exists public.fogon_server_templates (
  id text primary key,
  name text not null,
  emoji text not null default '📁',
  description text not null default '',
  position int not null default 0,
  structure jsonb not null
);
alter table public.fogon_server_templates enable row level security;
drop policy if exists fogon_server_templates_read on public.fogon_server_templates;
create policy fogon_server_templates_read on public.fogon_server_templates for select to authenticated using (true);
revoke all on public.fogon_server_templates from public, anon, authenticated;
grant select on public.fogon_server_templates to authenticated;

insert into public.fogon_server_templates (id, name, emoji, description, position, structure) values
('comunidad', 'Comunidad', '🏕️', 'Anuncios, reglas, charla general y canales de voz.', 1,
'{"roles":[{"name":"Staff","color":"#f2a531","position":5,"hoist":true,"perms":["manage_messages","kick_members","mute_members","move_members"]},{"name":"Fogonero/a","color":"#4f9d69","position":1,"hoist":false,"perms":[],"auto_assign":true}],"categories":[{"name":"INFORMACIÓN","position":0,"channels":[{"kind":"text","name":"anuncios","topic":"Novedades del servidor","position":0},{"kind":"text","name":"reglas","topic":"Cómo nos tratamos","position":1},{"kind":"text","name":"presentate","topic":"Contá quién sos","position":2}]},{"name":"CHARLA","position":1,"channels":[{"kind":"text","name":"general","topic":"Para charlar de todo","position":0},{"kind":"text","name":"memes","topic":"Risas","position":1},{"kind":"voice","name":"Fogón","position":2},{"kind":"voice","name":"Música","position":3}]}]}'),
('gaming', 'Gaming', '🎮', 'Buscar partida, clips y voz para jugar en equipo.', 2,
'{"roles":[{"name":"Capitán","color":"#7a63d6","position":5,"hoist":true,"perms":["manage_messages","kick_members","mute_members","move_members"]},{"name":"Player","color":"#3f7fd1","position":1,"hoist":false,"perms":[],"auto_assign":true}],"categories":[{"name":"INFORMACIÓN","position":0,"channels":[{"kind":"text","name":"anuncios","topic":"Torneos y novedades","position":0},{"kind":"text","name":"reglas","topic":"Cómo jugamos","position":1}]},{"name":"JUGAR","position":1,"channels":[{"kind":"text","name":"general","topic":"Charla y coordinación","position":0},{"kind":"text","name":"clips","topic":"Tus mejores jugadas","position":1},{"kind":"text","name":"buscar-grupo","topic":"Decí a qué jugás y a qué hora","position":2},{"kind":"text","name":"torneos","topic":"Inscripciones y resultados","position":3}]},{"name":"VOZ","position":2,"channels":[{"kind":"voice","name":"Lobby","position":0},{"kind":"voice","name":"Ranked","position":1},{"kind":"voice","name":"AFK","position":2}]}]}'),
('estudio', 'Estudio', '📚', 'Apuntes, recursos y una sala de estudio en voz.', 3,
'{"roles":[{"name":"Profe","color":"#2f9c95","position":5,"hoist":true,"perms":["manage_messages","mute_members"]},{"name":"Estudiante","color":"#d4a72c","position":1,"hoist":false,"perms":[],"auto_assign":true}],"categories":[{"name":"INFORMACIÓN","position":0,"channels":[{"kind":"text","name":"anuncios","topic":"Fechas y novedades","position":0}]},{"name":"ESTUDIO","position":1,"channels":[{"kind":"text","name":"general","topic":"Charlamos y nos ayudamos","position":0},{"kind":"text","name":"apuntes","topic":"Compartí material","position":1},{"kind":"text","name":"recursos","topic":"Links y herramientas","position":2},{"kind":"text","name":"dudas","topic":"Preguntá lo que no te cierra","position":3}]},{"name":"VOZ","position":2,"channels":[{"kind":"voice","name":"Sala de estudio","position":0},{"kind":"voice","name":"Música","position":1}]}]}'),
('amigos', 'Amigos', '🧉', 'Simple: charla, memes y un canal de voz para juntarse.', 4,
'{"roles":[{"name":"Mod","color":"#e07a3f","position":5,"hoist":true,"perms":["manage_messages","kick_members"]},{"name":"Amigo/a","color":"#c4569b","position":1,"hoist":false,"perms":[],"auto_assign":true}],"categories":[{"name":"CHARLA","position":0,"channels":[{"kind":"text","name":"general","topic":"Para charlar de todo","position":0},{"kind":"text","name":"memes","topic":"Risas","position":1},{"kind":"text","name":"música","topic":"Lo que estamos escuchando","position":2}]},{"name":"VOZ","position":1,"channels":[{"kind":"voice","name":"Fogón","position":0}]}]}')
on conflict (id) do update set name = excluded.name, emoji = excluded.emoji, description = excluded.description, position = excluded.position, structure = excluded.structure;

-- Aplica una plantilla a un servidor: agrega categorías, canales y roles (no borra nada).
create or replace function public.fogon_apply_template(p_server uuid, p_template text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  st jsonb; cat jsonb; ch jsonb; ro jsonb; cat_id uuid; n int := 0;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para usar plantillas'; end if;
  if not public.fogon_has_perm(p_server, 'manage_server') then raise exception 'No tenés permiso para cambiar este servidor'; end if;
  select structure into st from public.fogon_server_templates where id = p_template;
  if st is null then raise exception 'Esa plantilla no existe'; end if;

  for ro in select * from jsonb_array_elements(coalesce(st->'roles', '[]'::jsonb)) loop
    insert into public.fogon_roles (server_id, name, color, position, hoist, perms, auto_assign)
    values (p_server,
            left(btrim(coalesce(ro->>'name', 'Rol')), 50),
            coalesce(ro->>'color', '#99a8a4'),
            least(greatest(coalesce((ro->>'position')::int, 1), 1), 999),
            coalesce((ro->>'hoist')::boolean, true),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(ro->'perms', '[]'::jsonb)) x where x = any(public.fogon_all_perms())), '{}'),
            coalesce((ro->>'auto_assign')::boolean, false));
    n := n + 1;
  end loop;

  for cat in select * from jsonb_array_elements(coalesce(st->'categories', '[]'::jsonb)) loop
    insert into public.fogon_channels (server_id, kind, name, position)
    values (p_server, 'category', left(btrim(coalesce(cat->>'name', 'Categoría')), 100), coalesce((cat->>'position')::int, 0))
    returning id into cat_id;
    n := n + 1;
    for ch in select * from jsonb_array_elements(coalesce(cat->'channels', '[]'::jsonb)) loop
      insert into public.fogon_channels (server_id, kind, name, topic, parent_id, position)
      values (p_server,
              case when ch->>'kind' = 'voice' then 'voice' else 'text' end,
              left(btrim(coalesce(ch->>'name', 'canal')), 100),
              coalesce(ch->>'topic', ''),
              cat_id,
              coalesce((ch->>'position')::int, 0));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.fogon_apply_template(uuid, text) from public, anon;
grant execute on function public.fogon_apply_template(uuid, text) to authenticated;

-- Crear servidor + plantilla en una sola operación (si algo falla, no queda el servidor a medias).
create or replace function public.fogon_create_server_from_template(p_name text, p_template text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if p_template is null or p_template = '' then return public.fogon_create_server(p_name); end if;
  if not exists (select 1 from public.fogon_server_templates where id = p_template) then raise exception 'Esa plantilla no existe'; end if;
  sid := public.fogon_create_server(p_name);
  -- la plantilla reemplaza el #general por defecto (recién creado, sin mensajes)
  delete from public.fogon_channels c
  where c.server_id = sid and c.kind = 'text' and c.name = 'general'
    and not exists (select 1 from public.fogon_messages m where m.channel_id = c.id);
  delete from public.fogon_channels c
  where c.server_id = sid and c.kind = 'category' and c.name = 'Canales de texto'
    and not exists (select 1 from public.fogon_channels ch where ch.parent_id = c.id);
  perform public.fogon_apply_template(sid, p_template);
  return sid;
end $$;
revoke execute on function public.fogon_create_server_from_template(text, text) from public, anon;
grant execute on function public.fogon_create_server_from_template(text, text) to authenticated;
