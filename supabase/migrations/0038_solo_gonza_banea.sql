-- Banear y desbanear cuentas de Fogón: solo @gonza (aunque haya otros admins).
do $$
declare f text; def text;
begin
  foreach f in array array['public.fogon_account_ban', 'public.fogon_account_unban'] loop
    def := pg_get_functiondef(f::regproc);
    def := replace(def, 'if not public.fogon_is_admin() then', 'if auth.uid() is distinct from ''e7809edc-8559-4df6-8d2b-1fffc7a27719''::uuid then');
    def := replace(def, 'Solo el equipo de Fogón puede banear cuentas.', 'Solo @gonza puede banear cuentas.');
    def := replace(def, 'Solo el equipo de Fogón puede quitar un ban.', 'Solo @gonza puede quitar un ban.');
    if position('e7809edc' in def) = 0 then raise exception 'no pude ajustar %', f; end if;
    execute def;
  end loop;
end $$;
