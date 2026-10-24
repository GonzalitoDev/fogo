-- Los pibes siempre activos: en línea a toda hora (alguno en No molestar), más charla en los canales
-- (también de madrugada), contestan más seguido y hay más gente en los canales de voz.
-- Sofi sigue con su rutina (duerme de madrugada); en voz, el que se va un rato aparece ausente.

do $$
declare def text := pg_get_functiondef('public.fogon_bots_tick'::regproc);
begin
  def := replace(def, $r$        when quiet then (array['idle','idle','idle','online'])[1 + floor(random() * 4)::int]$r$,
                      $r$        when quiet then (array['online','online','online','dnd'])[1 + floor(random() * 4)::int]$r$);
  def := replace(def, $r$        else (array['online','online','online','idle','dnd'])[1 + floor(random() * 5)::int] end$r$,
                      $r$        else (array['online','online','online','online','dnd'])[1 + floor(random() * 5)::int] end$r$);
  def := replace(def, 'if random() < (case when quiet then 0.04 else 0.3 end) then', 'if random() < (case when quiet then 0.2 else 0.55 end) then');
  def := replace(def, 'if random() < (case when quiet then 0.03 else 0.25 end) then', 'if random() < (case when quiet then 0.2 else 0.5 end) then');
  def := replace(def, $r$or random() < 0.35) then continue; end if;$r$, $r$or random() < 0.75) then continue; end if;$r$);
  if position('0.55' in def) = 0 or position('0.75' in def) = 0 then raise exception 'no pude ajustar fogon_bots_tick'; end if;
  execute def;
end $$;

do $$
declare def text := pg_get_functiondef('public.fogon_bots_social'::regproc);
begin
  def := replace(def, $r$update public.fogon_profiles set status = case when awake then 'online' else 'idle' end
  where id = mica and status is distinct from case when awake then 'online' else 'idle' end;$r$,
  $r$update public.fogon_profiles set status = 'online' where id = mica and status is distinct from 'online';$r$);
  execute def;
end $$;

do $$
declare def text := pg_get_functiondef('public.fogon_bots_voice_tick'::regproc);
begin
  def := replace(def, 'then 0.018 else 0.0015 end', 'then 0.03 else 0.006 end');
  if position('0.006' in def) = 0 then raise exception 'no pude ajustar fogon_bots_voice_tick'; end if;
  execute def;
end $$;

update public.fogon_profiles p set status = 'online'
where p.is_bot and p.username <> 'sofi' and p.status is distinct from 'online'
  and not exists (select 1 from public.fogon_bot_voice v where v.bot_id = p.id and v.afk_until > now());
