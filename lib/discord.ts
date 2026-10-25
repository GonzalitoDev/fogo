/**
 * Traer una plantilla real de Discord (discord.new/XXXX) y convertirla a la forma de Fogón.
 * Solo se usan canales y roles: los permisos se traducen a los 19 de Fogón y se descartan
 * los roles de bots (@everyone, integraciones) y lo que no existe acá (foros, hilos, stages).
 */

export type StructureChannel = { kind: "text" | "voice"; name: string; topic?: string; position?: number };
export type StructureRole = { name: string; color?: string; position?: number; hoist?: boolean; perms?: string[] };
export type ServerStructure = {
  roles: StructureRole[];
  categories: { name: string; position?: number; channels: StructureChannel[] }[];
  loose: StructureChannel[];
};

export type DiscordPreview = {
  name: string;
  description: string;
  structure: ServerStructure;
  counts: { roles: number; categories: number; text: number; voice: number; skipped: number };
  sample: string[];
};

type DiscRole = { name?: string; color?: number; hoist?: boolean; position?: number; permissions?: string; managed?: boolean };
type DiscChannel = { id?: string; type?: number; name?: string; position?: number; parent_id?: string | null; topic?: string | null };
type DiscTemplate = { name?: string; description?: string; serialized_source_guild?: { name?: string; roles?: DiscRole[]; channels?: DiscChannel[] } };

const PERM_BITS: [bigint, string][] = [
  [1n << 10n, "view_channel"],
  [1n << 4n, "manage_channels"],
  [1n << 28n, "manage_roles"],
  [1n << 5n, "manage_server"],
  [1n << 0n, "create_invite"],
  [1n << 1n, "kick_members"],
  [1n << 2n, "ban_members"],
  [1n << 11n, "send_messages"],
  [1n << 6n, "add_reactions"],
  [1n << 15n, "attach_files"],
  [1n << 17n, "mention_everyone"],
  [1n << 13n, "manage_messages"],
  [1n << 20n, "connect"],
  [1n << 21n, "speak"],
  [1n << 9n, "video"],
  [1n << 22n, "mute_members"],
  [1n << 23n, "deafen_members"],
  [1n << 24n, "move_members"],
];

/** Discord manda los permisos como bitfield en string. */
export function permsFromDiscord(raw: string | undefined): string[] {
  let bits = 0n;
  try {
    bits = BigInt(raw || "0");
  } catch {
    return [];
  }
  if ((bits & (1n << 3n)) !== 0n) return ["administrator"];
  return PERM_BITS.filter(([bit]) => (bits & bit) !== 0n).map(([, perm]) => perm);
}

/** Acepta el link o el código pelado. */
export function parseDiscordLink(input: string): string | null {
  const t = (input || "").trim();
  if (!t) return null;
  const m = /(?:discord\.new\/|discord\.com\/template\/)([A-Za-z0-9_-]{4,64})/i.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{4,64}$/.test(t) ? t : null;
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const colorOf = (n: unknown) => {
  const c = Number(n) || 0;
  return c > 0 && c <= 0xffffff ? `#${c.toString(16).padStart(6, "0")}` : undefined;
};

/** Convierte el JSON de la API de Discord a una estructura que entiende Fogón. */
export function mapDiscordTemplate(json: unknown): DiscordPreview {
  const t = (json ?? {}) as DiscTemplate;
  const g = t.serialized_source_guild ?? {};
  const name = text(t.name || g.name || "Servidor de Discord", 100) || "Servidor de Discord";
  const description = text(t.description, 300);

  const allRoles = (g.roles ?? []).filter((r) => r && !r.managed && text(r.name, 50) && text(r.name, 50) !== "@everyone");
  const roles: StructureRole[] = allRoles
    .slice()
    .sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0))
    .slice(0, 80)
    .map((r) => ({
      name: text(r.name, 50),
      color: colorOf(r.color),
      position: Math.min(999, Math.max(1, Number(r.position) || 1)),
      hoist: r.hoist !== false,
      perms: permsFromDiscord(r.permissions),
    }));

  const all = (g.channels ?? []).filter((c) => c && text(c.name, 100));
  const kindOf = (type: number | undefined): "text" | "voice" | null => {
    if (type === 0 || type === 5 || type === 15) return "text";
    if (type === 2 || type === 13) return "voice";
    return null;
  };
  const cats = all.filter((c) => c.type === 4).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  const byParent = new Map<string, DiscChannel[]>();
  const looseRaw: DiscChannel[] = [];
  let skipped = 0;
  for (const c of all) {
    if (c.type === 4) continue;
    if (!kindOf(c.type)) {
      skipped++;
      continue;
    }
    const p = c.parent_id ?? "";
    if (p && cats.some((cat) => cat.id === p)) {
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(c);
    } else looseRaw.push(c);
  }

  let total = 0;
  const categories: ServerStructure["categories"] = [];
  for (const cat of cats) {
    const kids = (byParent.get(cat.id ?? "") ?? []).sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
    const channels: StructureChannel[] = [];
    for (const c of kids) {
      if (total >= 120) break;
      const kind = kindOf(c.type);
      if (!kind) continue;
      channels.push({ kind, name: text(c.name, 100), topic: text(c.topic, 200) || undefined, position: channels.length });
      total++;
    }
    categories.push({ name: text(cat.name, 100), position: categories.length, channels });
  }

  const loose: StructureChannel[] = [];
  for (const c of looseRaw.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))) {
    if (total >= 120) {
      skipped++;
      continue;
    }
    const kind = kindOf(c.type);
    if (!kind) continue;
    loose.push({ kind, name: text(c.name, 100), topic: text(c.topic, 200) || undefined, position: loose.length });
    total++;
  }

  const structure: ServerStructure = { roles, categories, loose };
  const textCount = [...categories.flatMap((c) => c.channels), ...loose].filter((c) => c.kind === "text").length;
  const voiceCount = [...categories.flatMap((c) => c.channels), ...loose].filter((c) => c.kind === "voice").length;
  const sample = [
    ...categories.flatMap((c) => c.channels.map((ch) => `${ch.kind === "voice" ? "🔊" : "#"} ${ch.name}`)),
    ...loose.map((ch) => `${ch.kind === "voice" ? "🔊" : "#"} ${ch.name}`),
  ].slice(0, 8);

  return {
    name,
    description,
    structure,
    counts: { roles: roles.length, categories: categories.length, text: textCount, voice: voiceCount, skipped },
    sample,
  };
}
