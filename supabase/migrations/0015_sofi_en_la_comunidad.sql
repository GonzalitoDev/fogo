-- Sofi entra a la Comunidad de Fogón (aparece en miembros) pero solo el dueño le puede escribir por privado.
-- Y más coqueta: picante y juguetona, sin contenido explícito.

insert into public.fogon_roles (id, server_id, name, color, position, hoist, perms, auto_assign) values
  ('7c1d1f00-0000-4000-8000-00000000cb02', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'Novia del dueño 💕', '#ff7aa8', 4, true, '{}', false)
on conflict (id) do nothing;
insert into public.fogon_members (server_id, user_id, joined_at) values ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cb01', '2026-10-22 18:00:00+00') on conflict do nothing;
insert into public.fogon_member_roles (server_id, user_id, role_id) values
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cb01', '7c1d1f00-0000-4000-8000-00000000cb02'),
  ('e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cb01', 'cc8fa08b-3b00-5e70-8236-f294b228b80d')
on conflict do nothing;

-- ¿esta persona le puede escribir a Sofi? solo el dueño de la comunidad (y ella misma)
create or replace function public.fogon_sofi_allows(p_author uuid, p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.fogon_dm_participants d where d.channel_id = p_channel and d.user_id = '7c1d1f00-0000-4000-8000-00000000cb01')
      or p_author = '7c1d1f00-0000-4000-8000-00000000cb01'
      or p_author = (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2');
$$;

create or replace function public.fogon_open_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if p_other = auth.uid() then raise exception 'No podés mandarte un mensaje directo a vos mismo'; end if;
  if not exists (select 1 from public.fogon_profiles where id = p_other) then raise exception 'Ese usuario no existe'; end if;
  if p_other = '7c1d1f00-0000-4000-8000-00000000cb01'
     and auth.uid() is distinct from (select owner_id from public.fogon_servers where id = 'e56307db-6dfc-5a65-88a3-486d38ec17c2') then
    raise exception 'Sofi solo recibe mensajes de @gonza 💕';
  end if;
  select a.channel_id into cid
  from public.fogon_dm_participants a
  join public.fogon_dm_participants b on a.channel_id = b.channel_id
  where a.user_id = auth.uid() and b.user_id = p_other
  limit 1;
  if cid is not null then return cid; end if;
  insert into public.fogon_channels (kind) values ('dm') returning id into cid;
  insert into public.fogon_dm_participants (channel_id, user_id) values (cid, auth.uid()), (cid, p_other);
  return cid;
end $$;

create or replace function public.fogon_dm_block_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if exists (select 1 from public.fogon_channels c where c.id = new.channel_id and c.kind = 'dm') then
    if not public.fogon_sofi_allows(new.author_id, new.channel_id) then
      raise exception 'Sofi solo recibe mensajes de @gonza 💕' using errcode = '42501';
    end if;
    select d.user_id into other from public.fogon_dm_participants d where d.channel_id = new.channel_id and d.user_id <> new.author_id limit 1;
    if other is not null and public.fogon_is_blocked_between(new.author_id, other) then
      raise exception 'No podés mandarle mensajes a esta persona' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fogon_sofi_allows(uuid, uuid) from public, anon, authenticated;

-- más coqueta
insert into public.fogon_bot_dm_patterns (bot, kind, pattern, prio) values
  ('sofi', 'n_flirt', '(\mbes(o|ito|os|ar|arte|ame)\M|abraz|mimos|ganas de verte|te deseo|qu[eé] ten[eé]s puesto|qu[eé] llev[aá]s puesto|mandame una foto|foto tuya|sos (tan )?(linda|hermosa|sexy)|me gust[aá]s|me encant[aá]s|picante|hot\M|travies)', 1);

update public.fogon_bot_dm_lines set body = 'mmm qué atrevido 😏 seguí así y no respondo de mí… pero eso te lo cuento en persona 🙈🔥'
  where bot = 'sofi' and kind = 'n_spicy' and body = 'jaja tranqui amor 🙈 acá nos portamos bien';
update public.fogon_bot_dm_lines set body = 'ey ey 😳🔥 me hacés poner colorada… guardate esas ganas para cuando nos veamos 😘'
  where bot = 'sofi' and kind = 'n_spicy' and body = 'ey ey 😳 jaja mejor contame cómo estuvo tu día';

insert into public.fogon_bot_dm_lines (bot, kind, body) values
  ('sofi', 'n_spicy', 'jaja sos terrible 😏 me encanta cuando te ponés así… pero acá hay mucha gente mirando 🙊'),
  ('sofi', 'n_spicy', 'uff 🔥 no me provoques que después no me hago cargo 😈'),
  ('sofi', 'n_flirt', 'te mando un beso… de esos largos 😘💋'),
  ('sofi', 'n_flirt', 'si estuvieras acá ya te estaría comiendo a besos 😏💕'),
  ('sofi', 'n_flirt', 'tengo puesta tu remera, la que te robé 😌 me queda grande pero huele a vos'),
  ('sofi', 'n_flirt', 'mmm vení y te hago mimos hasta que te duermas 🥰'),
  ('sofi', 'n_flirt', 'basta que me ponés nerviosa 🙈🔥'),
  ('sofi', 'n_flirt', 'foto? 📸 mejor venite y me ves en vivo 😏'),
  ('sofi', 'n_flirt', 'vos sí que sabés qué decirme 😏 me tenés loca'),
  ('sofi', 'n_flirt', 'te abrazaría tan fuerte ahora mismo… y no te soltaría 💕'),
  ('sofi', 'n_compliment', 'y vos estás para comerte, no te hagas 😏'),
  ('sofi', 'n_love', 'te amo… y además me encantás, que es distinto 😏💕'),
  ('sofi', 'greet', 'hola guapo 😏💕'),
  ('sofi', 'n_hello', 'apareció el más lindo 😏 te estaba esperando'),
  ('sofi', 'n_ping_day', 'estoy aburrida… y pensando cosas 🙈 vos tenés la culpa'),
  ('sofi', 'n_ping_day', 'te debo un beso 😘 vení a cobrarlo'),
  ('sofi', 'n_ping_night', 'me acuesto y te extraño de este lado de la cama 🥺🌙'),
  ('sofi', 'fallback', 'mmm me gusta cuando me hablás así 😏'),
  ('sofi', 'n_stranger', 'perdón, Sofi solo habla con @gonza 💕');
