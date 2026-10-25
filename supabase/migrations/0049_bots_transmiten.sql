-- Los bots también transmiten pantalla: un video en vivo generado en el navegador de cada
-- espectador (canvas → MediaStream). La base solo dice qué bot está "al aire" y desde cuándo.

alter table public.fogon_bot_voice add column if not exists screen boolean not null default false;
alter table public.fogon_bot_voice add column if not exists screen_started_at timestamptz;

-- Se corre cada minuto: los bots que están en un canal de voz y saben transmitir quedan al aire.
create or replace function public.fogon_bot_screens_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fogon_bot_voice v
  set screen = (p.username in ('temazo.dj', 'radio.fogon', 'ro.musica', 'tincho_gamer', 'mica.cm')),
      screen_started_at = case
        when p.username in ('temazo.dj', 'radio.fogon', 'ro.musica', 'tincho_gamer', 'mica.cm') then coalesce(v.screen_started_at, now())
        else null
      end
  from public.fogon_profiles p
  where p.id = v.bot_id and v.channel_id is not null;

  update public.fogon_bot_voice set screen = false, screen_started_at = null where channel_id is null and screen;
end $$;
revoke execute on function public.fogon_bot_screens_tick() from public, anon, authenticated;
select cron.schedule('fogon-bot-screens', '* * * * *', 'select public.fogon_bot_screens_tick()');
select public.fogon_bot_screens_tick();
