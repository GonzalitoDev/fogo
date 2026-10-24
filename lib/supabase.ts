import { createClient } from "@supabase/supabase-js";

// Valores por defecto: el proyecto de Fogón. La publishable key es pública por diseño
// (viaja al navegador igual); lo que protege los datos es RLS en la base.
// Se pueden pisar con NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xfwolaurpeofysnymqle.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_3VvBUD5Bdu3Uaq59fJ99MQ_XDCtujUU";

export const configured = !!url && !!key;
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const BUCKET = "fogon-attachments";
