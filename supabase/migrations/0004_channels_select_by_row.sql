-- El SELECT de canales buscaba el canal por id (fogon_can_read), y en un INSERT ... RETURNING
-- la fila nueva todavía no es visible para esa función: crear canales fallaba con 403.
-- Ahora la regla usa las columnas de la propia fila.
create or replace function public.fogon_is_dm_participant(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fogon_dm_participants d where d.channel_id = p_channel and d.user_id = auth.uid());
$$;
revoke execute on function public.fogon_is_dm_participant(uuid) from public, anon;
grant execute on function public.fogon_is_dm_participant(uuid) to authenticated;

drop policy fogon_channels_select on public.fogon_channels;
create policy fogon_channels_select on public.fogon_channels for select to authenticated using (
  (kind <> 'dm' and public.fogon_is_member(server_id))
  or (kind = 'dm' and public.fogon_is_dm_participant(id))
);
