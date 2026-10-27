-- Problemas desde la pantalla de inicio (sin cuenta, por ejemplo si no podés entrar) y aviso de gonza.bot
-- en un canal privado de la Comunidad de Fogón que solo ve Gonza.

-- 1) Reportes sin cuenta: guardan un email de contacto en vez del usuario.
alter table public.fogon_problems alter column user_id drop not null;
alter table public.fogon_problems add column if not exists contact_email text;
alter table public.fogon_problems drop constraint if exists fogon_problems_contact_check;
alter table public.fogon_problems add constraint fogon_problems_contact_check
  check (user_id is not null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.fogon_problem_msgs alter column author_id drop not null;

-- Límites para que no se pueda llenar de spam sin iniciar sesión: 3 por hora por email y 30 por hora en total.
create or replace function public.fogon_problem_report_public(p_email text, p_kind text, p_title text, p_body text, p_info jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid; e text := lower(btrim(coalesce(p_email, ''))); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, ''));
begin
  if e !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 200 then raise exception 'Poné un email válido para que te podamos contestar'; end if;
  if length(t) < 3 then raise exception 'Poné un título corto que describa el problema'; end if;
  if length(b) < 10 then raise exception 'Contá un poco más qué pasó'; end if;
  if (select count(*) from public.fogon_problems where contact_email = e and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.fogon_problems where user_id is null and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Llegaron muchos reportes seguidos. Esperá un rato y probá de nuevo';
  end if;
  insert into public.fogon_problems (user_id, contact_email, kind, title, info)
  values (null, e, case when p_kind in ('bug', 'security', 'account', 'idea', 'other') then p_kind else 'other' end,
          left(t, 120), case when jsonb_typeof(p_info) = 'object' and length(p_info::text) <= 2000 then p_info else '{}' end)
  returning id into pid;
  insert into public.fogon_problem_msgs (problem_id, author_id, body) values (pid, null, left(b, 4000));
end $$;
revoke execute on function public.fogon_problem_report_public(text, text, text, text, jsonb) from public;
grant execute on function public.fogon_problem_report_public(text, text, text, text, jsonb) to anon, authenticated;

-- 2) Canal privado #problemas en la categoría administracion: nadie lo ve salvo Gonza (dueño).
insert into public.fogon_channels (id, server_id, kind, name, topic, position, parent_id)
select '7c1d1f00-0000-4000-8000-00000000cc10', 'e56307db-6dfc-5a65-88a3-486d38ec17c2', 'text', '🛠️┃problemas',
       'gonza.bot avisa acá cada problema que reporta la gente. Contestalos en Ajustes → Problemas.', 2,
       '282be3b7-d89e-4cfd-b3e8-fc76cca67925'
where exists (select 1 from public.fogon_channels where id = '282be3b7-d89e-4cfd-b3e8-fc76cca67925')
on conflict (id) do nothing;
insert into public.fogon_channel_overrides (server_id, channel_id, role_id, allow, deny)
select 'e56307db-6dfc-5a65-88a3-486d38ec17c2', '7c1d1f00-0000-4000-8000-00000000cc10', null, '{}', array['view_channel', 'send_messages']
where exists (select 1 from public.fogon_channels where id = '7c1d1f00-0000-4000-8000-00000000cc10')
  and not exists (select 1 from public.fogon_channel_overrides where channel_id = '7c1d1f00-0000-4000-8000-00000000cc10' and role_id is null);

-- 3) gonza.bot avisa en #problemas: el reporte entero cuando llega, y una línea cuando alguien responde.
create or replace function public.fogon_problem_bot_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_bot uuid := '7c1d1f00-0000-4000-8000-0000000060a1';
  v_owner uuid := 'e7809edc-8559-4df6-8d2b-1fffc7a27719';
  v_ch uuid := '7c1d1f00-0000-4000-8000-00000000cc10';
  p public.fogon_problems; who text; msg text; k text; first boolean;
begin
  if new.author_id is not distinct from v_owner then return null; end if;
  if not exists (select 1 from public.fogon_channels where id = v_ch) then return null; end if;
  select * into p from public.fogon_problems where id = new.problem_id;
  -- lo que escribe la gente va sin @ activos, para que nadie pueda mencionar a toda la comunidad
  who := coalesce('@' || (select username from public.fogon_profiles where id = p.user_id), p.contact_email || ' (sin cuenta)', 'alguien');
  first := not exists (select 1 from public.fogon_problem_msgs m where m.problem_id = p.id and m.id < new.id);
  if first then
    k := case p.kind when 'bug' then '🐛 Algo no anda' when 'security' then '🔐 Seguridad' when 'account' then '👤 Cuenta'
                     when 'idea' then '💡 Idea o pedido' else '💬 Otro' end;
    msg := '🛠️ **Problema nuevo** — ' || k || chr(10)
      || '**' || replace(p.title, '@', '@' || chr(8203)) || '**' || chr(10)
      || 'De ' || replace(who, '@', '@' || chr(8203)) || chr(10) || chr(10)
      || replace(left(new.body, 1200), '@', '@' || chr(8203))
      || case when length(new.body) > 1200 then '…' else '' end
      || coalesce(chr(10) || chr(10) || '_' || (select string_agg(key || ': ' || replace(left(value, 80), '@', '@' || chr(8203)), ' · ') from jsonb_each_text(p.info)) || '_', '')
      || chr(10) || 'Contestalo en Ajustes → Problemas.';
  else
    msg := '💬 ' || replace(who, '@', '@' || chr(8203)) || ' respondió en «' || replace(p.title, '@', '@' || chr(8203)) || '»: '
      || replace(left(new.body, 300), '@', '@' || chr(8203)) || case when length(new.body) > 300 then '…' else '' end;
  end if;
  perform public.fogon_bot_enqueue(v_ch, v_bot, left(msg, 2000), null, interval '1 second');
  return null;
exception when others then return null; -- el aviso nunca puede impedir que se guarde el reporte
end $$;
drop trigger if exists fogon_problem_bot_notify on public.fogon_problem_msgs;
create trigger fogon_problem_bot_notify after insert on public.fogon_problem_msgs
  for each row execute function public.fogon_problem_bot_notify();

-- 4) Ahora hay reportes sin usuario: comparar con "is distinct from" para que un null no deje pasar a nadie.
do $$
declare def text := pg_get_functiondef('public.fogon_problem_reply'::regproc);
begin
  def := replace(def, '(p.user_id <> me and not owner)', '(p.user_id is distinct from me and not owner)');
  def := replace(def, 'when owner and p.user_id <> me then true', 'when owner and p.user_id is distinct from me and p.user_id is not null then true');
  if position('p.user_id is distinct from me and not owner' in def) = 0 then raise exception 'no pude ajustar fogon_problem_reply'; end if;
  execute def;
end $$;
