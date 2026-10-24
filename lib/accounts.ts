"use client";

/*
 * Cuentas guardadas en este dispositivo (como "Cambiar de cuenta" en Discord).
 * Se guarda el email y cómo se ve la cuenta, y la sesión de cada una para pasar de una a
 * otra sin poner la contraseña. Nunca se guarda la contraseña.
 * Al cerrar sesión la cuenta queda en la lista (sin sesión) para entrar más rápido.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase, SUPABASE_URL } from "./supabase";
import type { Profile } from "./types";

export type SavedAccount = {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  color?: string;
  avatar_path?: string | null;
  access_token?: string;
  refresh_token?: string;
  saved_at: number;
};

const KEY = "fogon:accounts";
const MAX = 5;
const AUTH_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export function savedAccounts(): SavedAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as SavedAccount[]).filter((a) => a && a.id && a.email) : [];
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.sort((a, b) => b.saved_at - a.saved_at).slice(0, MAX)));
  } catch {}
}

function upsert(id: string, patch: Partial<SavedAccount>) {
  const list = savedAccounts();
  const cur = list.find((a) => a.id === id);
  if (cur) Object.assign(cur, patch, { saved_at: Date.now() });
  else if (patch.email) list.push({ id, email: patch.email, saved_at: Date.now(), ...patch });
  write(list);
}

/** Cada vez que hay sesión (entrar, renovar el token) se guarda la de esa cuenta. */
export function rememberSession(s: Session) {
  if (!s.user.email) return;
  upsert(s.user.id, { email: s.user.email, access_token: s.access_token, refresh_token: s.refresh_token });
}

export function rememberProfile(p: Profile) {
  upsert(p.id, { username: p.username, display_name: p.display_name, color: p.color, avatar_path: p.avatar_path ?? null });
}

/** La cuenta queda en la lista pero sin sesión (hay que poner la contraseña). */
export function forgetSession(id: string) {
  write(savedAccounts().map((a) => (a.id === id ? { ...a, access_token: undefined, refresh_token: undefined } : a)));
}

/** Sacar la cuenta de la lista de este dispositivo. */
export function forgetAccount(id: string) {
  write(savedAccounts().filter((a) => a.id !== id));
}

/** Pasar a otra cuenta guardada. Si su sesión venció, devuelve false (hay que entrar con contraseña). */
export async function switchTo(id: string): Promise<boolean> {
  const acc = savedAccounts().find((a) => a.id === id);
  if (!acc?.refresh_token) return false;
  const { error } = await supabase.auth.setSession({ access_token: acc.access_token ?? "", refresh_token: acc.refresh_token });
  if (error) {
    forgetSession(id);
    return false;
  }
  return true;
}

/** Ir a la pantalla de inicio para sumar otra cuenta, sin cerrar la sesión de la actual (queda guardada). */
export function addAnotherAccount() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {}
  location.hash = "";
  location.reload();
}

/** Errores típicos al escribir el email (gmail.con, hotmial.com…). Devuelve el email corregido o null. */
const DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.ar", "live.com", "icloud.com", "hotmail.com.ar"];
const TYPOS: Record<string, string> = {
  "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmail.comm": "gmail.com", "gmail.cmo": "gmail.com",
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "gmai.com": "gmail.com", "gmail.es": "gmail.com",
  "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmai.com": "hotmail.com", "homail.com": "hotmail.com",
  "outlook.con": "outlook.com", "outlok.com": "outlook.com", "outllok.com": "outlook.com",
  "yahoo.con": "yahoo.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com",
  "live.con": "live.com", "icloud.con": "icloud.com",
};
export function emailTypo(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const [, user, dom] = m;
  if (DOMAINS.includes(dom)) return null;
  const fix = TYPOS[dom] ?? (dom.endsWith(".con") ? dom.slice(0, -4) + ".com" : null);
  return fix ? `${user}@${fix}` : null;
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return email;
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
}
