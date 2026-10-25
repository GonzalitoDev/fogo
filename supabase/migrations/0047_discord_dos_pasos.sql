-- pg_net es asíncrono: la request recién la ve el worker cuando termina la transacción.
-- Por eso el import va en dos pasos: pedir (guarda la request) y consultar (trae el resultado).

create or replace function public.fogon_discord_request(p_code text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare code text; req bigint;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para importar de Discord'; end if;
  code := btrim(coalesce(p_code, ''));
  code := regexp_replace(code, '^.*discord\.new/', '');
  code := regexp_replace(code, '^.*discord\.com/template/', '');
  code := split_part(split_part(code, '?', 1), '/', 1);
  if code !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'Poné un link de plantilla de Discord válido (discord.new/…)'; end if;
  delete from net._http_response where created < now() - interval '10 minutes';
  req := net.http_get(url := 'https://discord.com/api/v10/guilds/templates/' || code, timeout_milliseconds := 8000);
  return req;
end $$;
revoke execute on function public.fogon_discord_request(text) from public, anon;
grant execute on function public.fogon_discord_request(text) to authenticated;

-- null = todavía está en camino. Errores de Discord salen como excepción.
create or replace function public.fogon_discord_result(p_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare st int; body text; to_ boolean; emsg text; j jsonb;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para importar de Discord'; end if;
  select status_code, content, timed_out, error_msg into st, body, to_, emsg from net._http_response where id = p_id;
  if not found then return null; end if;
  if coalesce(to_, false) or emsg is not null then raise exception 'Discord no contestó a tiempo, probá de nuevo'; end if;
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
revoke execute on function public.fogon_discord_result(bigint) from public, anon;
grant execute on function public.fogon_discord_result(bigint) to authenticated;

drop function if exists public.fogon_discord_template(text);
