// Insignias al estilo Discord. Las "a mano" las da el admin; "pionero" sale sola por la fecha de la cuenta.
export type BadgeId = "fundador" | "staff" | "moderador" | "cazabugs" | "dev" | "artista" | "vip" | "embajador" | "socio" | "exmod" | "eventos" | "betatester" | "partidario" | "premium" | "pionero";

export const BADGES: Record<BadgeId, { label: string; desc: string; color: string; auto?: boolean }> = {
  fundador: { label: "Creador de Fogón", desc: "Hizo Fogón con sus propias manos.", color: "#f2a531" },
  staff: { label: "Equipo de Fogón", desc: "Ayuda a que Fogón ande bien.", color: "#5b8cff" },
  moderador: { label: "Moderador certificado", desc: "Cuida los servidores y a la gente.", color: "#3fbf7f" },
  cazabugs: { label: "Cazador de bugs", desc: "Encontró y reportó errores de Fogón.", color: "#2fb9a8" },
  dev: { label: "Desarrollador", desc: "Programa cosas.", color: "#9b7bff" },
  artista: { label: "Artista", desc: "Hace arte, música o diseño.", color: "#ff6fa8" },
  vip: { label: "VIP", desc: "Persona muy importante del fogón.", color: "#e6b800" },
  embajador: { label: "Embajador", desc: "Trajo 3 amigos o más a la Comunidad de Fogón.", color: "#eb459e" },
  socio: { label: "Propietario de servidor asociado", desc: "Dueño de una comunidad asociada a Fogón (programa de socios).", color: "#4f8cff" },
  exmod: { label: "Egresado del Programa de Moderadores", desc: "Formó parte del programa oficial de moderación de Fogón.", color: "#3ba55d" },
  eventos: { label: "Eventos del Fogón", desc: "Organizó o se sumó a eventos de la comunidad en nombre de Fogón.", color: "#f0b232" },
  betatester: { label: "Beta tester", desc: "Probó Fogón antes que nadie y ayudó a mejorarlo.", color: "#00b0f4" },
  partidario: { label: "Partidario inicial", desc: "Apoyó a Fogón con Premium desde el principio.", color: "#c58cff" },
  premium: { label: "Fogón Premium", desc: "Tiene Fogón Premium: nombre con estilo, decoraciones, efectos y temas.", color: "#ff73fa", auto: true },
  pionero: { label: "Pionero", desc: "Se sumó a Fogón en su primer mes.", color: "#e07a3f", auto: true },
};

/** Orden en que se muestran (como en Discord, las más importantes primero). */
export const ORDER: BadgeId[] = ["fundador", "staff", "socio", "moderador", "exmod", "dev", "cazabugs", "eventos", "artista", "vip", "embajador", "betatester", "partidario", "premium", "pionero"];
export const GRANTABLE = ORDER.filter((b) => !BADGES[b].auto);

/** Fogón salió el 22/10/2026: quien creó su perfil antes del 22/11/2026 es pionero. */
export const PIONEER_UNTIL = "2026-11-22T00:00:00Z";

export function badgesFor(granted: string[] | undefined, createdAt?: string, premium?: boolean): BadgeId[] {
  const set = new Set((granted ?? []).filter((b): b is BadgeId => b in BADGES));
  if (premium) set.add("premium");
  if (createdAt && createdAt < PIONEER_UNTIL) set.add("pionero");
  return ORDER.filter((b) => set.has(b));
}
