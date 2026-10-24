import type { Channel, Message, Profile, Reaction } from "./types";

export const GROUP_GAP_MS = 7 * 60_000;
export const MAX_LEN = 2000;
export const MAX_FILE = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type Row =
  | { kind: "day"; key: string; date: Date }
  | { kind: "msg"; key: string; msg: Message; head: boolean };

/** Separadores por día y agrupado: mismo autor, menos de 7 min, sin respuesta en el medio */
export function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let prev: Message | null = null;
  for (const m of messages) {
    const d = new Date(m.created_at);
    if (!prev || new Date(prev.created_at).toDateString() !== d.toDateString()) {
      rows.push({ kind: "day", key: `day-${d.toDateString()}`, date: d });
      prev = null;
    }
    const head =
      !prev ||
      prev.author_id !== m.author_id ||
      d.getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS ||
      !!m.reply_to_id;
    rows.push({ kind: "msg", key: m.id, msg: m, head });
    prev = m;
  }
  return rows;
}

/** Inserta o reemplaza manteniendo el orden por fecha */
export function upsertMessage(list: Message[], m: Message): Message[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = list.slice();
    // el eco del servidor reemplaza al optimista pero conserva las previsualizaciones locales
    next[i] = { ...m, localFiles: m.attachments.length ? undefined : list[i].localFiles };
    return next;
  }
  const next = [...list, m];
  if (list.length && new Date(list[list.length - 1].created_at) > new Date(m.created_at)) {
    next.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return next;
}

export type ReactionGroup = { emoji: string; count: number; mine: boolean; users: string[] };

export function groupReactions(reactions: Reaction[], me: string): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, users: [] };
    g.count++;
    g.users.push(r.user_id);
    if (r.user_id === me) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

/** Palabra que se está escribiendo justo antes del cursor, si empieza con @ o # */
export function activeTrigger(text: string, caret: number): { char: "@" | "#"; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)([@#])([A-Za-z0-9_.\-]{0,32})$/.exec(before);
  if (!m) return null;
  return { char: m[2] as "@" | "#", query: m[3].toLowerCase(), start: caret - m[3].length - 1 };
}

export function filterProfiles(list: Profile[], q: string, limit = 8): Profile[] {
  const n = q.toLowerCase();
  return list
    .filter((p) => p.username.includes(n) || p.display_name.toLowerCase().includes(n))
    .sort((a, b) => Number(!a.username.startsWith(n)) - Number(!b.username.startsWith(n)) || a.username.localeCompare(b.username))
    .slice(0, limit);
}

/** Canales del servidor agrupados por categoría, en orden */
export function channelTree(channels: Channel[], serverId: string) {
  const mine = channels.filter((c) => c.server_id === serverId);
  const byPos = (a: Channel, b: Channel) => a.position - b.position || a.created_at.localeCompare(b.created_at);
  const cats = mine.filter((c) => c.kind === "category").sort(byPos);
  const texts = mine.filter((c) => c.kind === "text").sort(byPos);
  return {
    loose: texts.filter((c) => !c.parent_id || !cats.some((k) => k.id === c.parent_id)),
    groups: cats.map((cat) => ({ cat, items: texts.filter((c) => c.parent_id === cat.id) })),
    flat: [...texts.filter((c) => !c.parent_id || !cats.some((k) => k.id === c.parent_id)), ...cats.flatMap((cat) => texts.filter((c) => c.parent_id === cat.id))],
  };
}

/** Nombre de canal al estilo Discord: minúsculas y guiones */
export function slugChannel(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-ñ]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function usernameFromEmail(email: string): string {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  return base.length >= 2 ? base : `usuario${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function friendlyError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  if (/Invalid login credentials/i.test(msg)) return "El email o la contraseña no coinciden.";
  if (/User already registered/i.test(msg)) return "Ya hay una cuenta con ese email. Probá iniciar sesión.";
  if (/Password should be at least/i.test(msg)) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (/Email not confirmed/i.test(msg)) return "Confirmá tu email con el link que te mandamos y volvé a intentar.";
  if (/rate limit/i.test(msg)) return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
  if (/duplicate key.*username/i.test(msg) || /fogon_profiles_username_key/.test(msg)) return "Ese nombre de usuario ya está usado. Probá con otro.";
  if (/violates check constraint.*username/i.test(msg)) return "El usuario solo puede tener letras minúsculas, números, punto y guion bajo (2 a 32).";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "No hay conexión con el servidor. Revisá internet y probá de nuevo.";
  if (/row-level security/i.test(msg)) return "No tenés permiso para hacer eso.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return "La imagen pesa más de 10 MB.";
  return msg;
}

export function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function stampLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const t = timeShort(iso);
  if (d.toDateString() === now.toDateString()) return `hoy a las ${t}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ayer a las ${t}`;
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric" })} ${t}`;
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Primer mensaje nuevo (de otra persona) después de lo último leído: ahí va la línea roja de NUEVOS. */
export function firstUnreadId(list: Message[], lastRead: string | null | undefined, me: string): string | null {
  if (!lastRead) return null;
  const t = new Date(lastRead).getTime();
  const m = list.find((x) => x.author_id !== me && !x.status && new Date(x.created_at).getTime() > t);
  return m?.id ?? null;
}
