// Boosts de servidor (como Discord Nitro): cada cuenta Premium tiene 2 boosts para repartir.
// Los umbrales tienen que coincidir con public.fogon_boost_level en la base.
export const BOOSTS_PER_USER = 2;
export const LEVELS = [
  { level: 1, need: 2, perks: ["Banner del servidor en la lista de canales", "Voz a 96 kbps"] },
  { level: 2, need: 7, perks: ["Ícono del servidor con brillo", "Voz a 128 kbps"] },
  { level: 3, need: 14, perks: ["Link de invitación personalizado", "Voz a 256 kbps"] },
] as const;

export function boostLevel(n: number | undefined | null): number {
  const c = n ?? 0;
  return c >= 14 ? 3 : c >= 7 ? 2 : c >= 2 ? 1 : 0;
}

/** Calidad de la voz según el nivel del servidor (bits por segundo). */
export function voiceBitrate(level: number): number {
  return [64000, 96000, 128000, 256000][level] ?? 64000;
}

/** Cuánto falta para el próximo nivel (null si ya está en el máximo). */
export function nextLevel(n: number): { level: number; need: number; missing: number } | null {
  const nx = LEVELS.find((l) => n < l.need);
  return nx ? { level: nx.level, need: nx.need, missing: nx.need - n } : null;
}
