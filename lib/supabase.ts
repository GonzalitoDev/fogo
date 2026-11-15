import { createClient } from "@supabase/supabase-js";

// Valores por defecto: el proyecto de Fogón. La publishable key es pública por diseño
// (viaja al navegador igual); lo que protege los datos es RLS en la base.
// Se pueden pisar con NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xfwolaurpeofysnymqle.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";

export const configured = !!url && !!key;
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

// Cloudflare Turnstile (CAPTCHA invisible con IA). La site key es pública:
// viaja al navegador. Si está vacía, el login queda sin verificación.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAGCepJEtTfOstZU-";

// link de "olvidé mi contraseña": hay que mirarlo antes de que Supabase limpie la URL
export const RECOVERY_LINK = typeof window !== "undefined" && /type=recovery/.test(window.location.hash);

/* PGRST303 "JWT issued at future" es un error transitorio de PostgREST
 * (desfase de reloj interno entre servicios de Supabase). No depende de este
 * código ni del reloj del usuario; suele recuperarse en 1-2 segundos. Lo
 * reintentamos en silencio un par de veces antes de devolver el error. */
function isIssuedAtFuture(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const b = body as { code?: string; message?: string; msg?: string; error_description?: string };
  return b.code === "PGRST303" || /issued at future/i.test(`${b.message ?? ""} ${b.msg ?? ""} ${b.error_description ?? ""}`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function retryingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(input, init);
    // PGRST303 llega como 401; cualquier otra cosa se devuelve tal cual.
    if (res.status !== 401 || attempt >= MAX_ATTEMPTS) return res;
    try {
      if (!isIssuedAtFuture(await res.clone().json())) return res;
    } catch {
      return res; // cuerpo no JSON: no es el error que estamos manejando
    }
    await sleep(400 * attempt * attempt); // 400ms, 1.6s
  }
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
  global: { fetch: retryingFetch },
});

export const BUCKET = "fogon-attachments";
