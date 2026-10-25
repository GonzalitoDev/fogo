// Credenciales temporales de TURN (Cloudflare Realtime) para las llamadas de Fogón.
// Con esto todo el audio y la pantalla pasan por Cloudflare: nadie ve la IP de los demás.
// La clave de Cloudflare vive en los secretos de Supabase (CF_TURN_KEY_ID / CF_TURN_API_TOKEN),
// nunca en el navegador. Solo entrega credenciales a quien tiene sesión en Fogón.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // solo gente con sesión
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sin sesión" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "sesión inválida" }, 401);

  const keyId = Deno.env.get("CF_TURN_KEY_ID");
  const apiToken = Deno.env.get("CF_TURN_API_TOKEN");
  if (!keyId || !apiToken) return json({ error: "TURN sin configurar" }, 503);

  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 6 * 3600 }),
  });
  if (!r.ok) return json({ error: "cloudflare", status: r.status }, 502);
  const data = await r.json();
  // los navegadores bloquean el puerto 53: lo saco para no perder tiempo probándolo
  const iceServers = (data.iceServers ?? []).map((s: { urls: string | string[]; username?: string; credential?: string }) => ({
    ...s,
    urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((x) => !/:53(\?|$)/.test(x)),
  }));
  return json({ iceServers, ttl: 6 * 3600 });
});
