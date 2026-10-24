-- Ordenar roles arrastrándolos (como Discord). Se manda el orden nuevo (de arriba a abajo) de todos
-- los roles que la persona puede tocar (los que están por debajo del suyo). Se reusan sus posiciones
-- actuales, así ninguno sube por encima de su rol; si están amontonadas, se reparten de corrido.
create or replace function public.fogon_reorder_roles(p_server uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  my_top integer;
  editable uuid[];
  slots integer[];
  pos integer[];
  k integer; i integer; top integer;
begin
  if not public.fogon_has_perm(p_server, 'manage_roles') then raise exception 'No tenés permiso para ordenar roles.'; end if;
  my_top := public.fogon_top_position(p_server, auth.uid());
  select array_agg(id order by position desc, created_at), array_agg(position order by position desc, created_at)
    into editable, slots
  from public.fogon_roles where server_id = p_server and position < my_top;
  if editable is null then return; end if;
  k := array_length(editable, 1);
  if coalesce(array_length(p_ids, 1), 0) <> k or not (p_ids <@ editable and editable <@ p_ids) then
    raise exception 'Solo podés ordenar los roles que están por debajo del tuyo.';
  end if;

  top := least(slots[1], my_top - 1);
  pos := array[top];
  for i in 2 .. k loop pos := pos || least(slots[i], pos[i - 1] - 1); end loop;
  if pos[k] < 1 then
    if top - (k - 1) < 1 then top := my_top - 1; end if;
    if top - (k - 1) < 1 then raise exception 'No hay lugar para ordenar tantos roles debajo del tuyo.'; end if;
    pos := '{}';
    for i in 1 .. k loop pos := pos || (top - (i - 1)); end loop;
  end if;

  for i in 1 .. k loop
    update public.fogon_roles set position = pos[i] where id = p_ids[i] and server_id = p_server;
  end loop;
end $$;
revoke execute on function public.fogon_reorder_roles(uuid, uuid[]) from public, anon;
grant execute on function public.fogon_reorder_roles(uuid, uuid[]) to authenticated;
