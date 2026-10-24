// Fogón Premium: lo que se puede tunear (nombre, decoración del avatar, efecto del perfil, tema de la app).
import type { Profile } from "./types";

export type NameStyle = "gradiente" | "brillo" | "arcoiris";
export type AvatarDeco = "fuego" | "corona" | "neon" | "corazones" | "estrellas" | "hojas";
export type ProfileEffect = "chispas" | "nieve" | "corazones" | "brasas" | "estrellas";
export type AppTheme = "medianoche" | "atardecer" | "aurora" | "fogon" | "rosa" | "oceano" | "bosque";

export const NAME_STYLES: { id: NameStyle; label: string }[] = [
  { id: "gradiente", label: "Degradé" },
  { id: "brillo", label: "Brillo" },
  { id: "arcoiris", label: "Arcoíris" },
];

export const DECOS: { id: AvatarDeco; label: string }[] = [
  { id: "fuego", label: "Fuego" },
  { id: "corona", label: "Corona" },
  { id: "neon", label: "Neón" },
  { id: "corazones", label: "Corazones" },
  { id: "estrellas", label: "Estrellas" },
  { id: "hojas", label: "Hojas" },
];

export const EFFECTS: { id: ProfileEffect; label: string }[] = [
  { id: "chispas", label: "Chispas" },
  { id: "brasas", label: "Brasas" },
  { id: "nieve", label: "Nieve" },
  { id: "corazones", label: "Corazones" },
  { id: "estrellas", label: "Estrellas" },
];

/** Temas de la app: superficies tintadas + un degradé suave en el chat. */
export const THEMES: { id: AppTheme; label: string; rail: string; side: string; chat: string; input: string; accent: string; grad: string }[] = [
  { id: "medianoche", label: "Medianoche", rail: "#0b0d1a", side: "#12152a", chat: "#171b33", input: "#232847", accent: "#7b8cff", grad: "linear-gradient(160deg, rgba(91,108,255,.18), transparent 60%)" },
  { id: "atardecer", label: "Atardecer", rail: "#1f1016", side: "#2a1620", chat: "#331b27", input: "#45253a", accent: "#ff7a59", grad: "linear-gradient(160deg, rgba(255,122,89,.20), rgba(214,72,140,.10) 55%, transparent)" },
  { id: "aurora", label: "Aurora", rail: "#08171a", side: "#0e2226", chat: "#122a2f", input: "#1d3a40", accent: "#3fe0b0", grad: "linear-gradient(160deg, rgba(63,224,176,.16), rgba(120,90,255,.12) 60%, transparent)" },
  { id: "fogon", label: "Fogón", rail: "#1a0f08", side: "#24150c", chat: "#2c1a10", input: "#3d2617", accent: "#ff8a3d", grad: "linear-gradient(180deg, transparent 40%, rgba(255,120,40,.16))" },
  { id: "rosa", label: "Rosa", rail: "#1f0c18", side: "#2a1121", chat: "#331529", input: "#48203a", accent: "#ff6fb5", grad: "linear-gradient(160deg, rgba(255,111,181,.18), transparent 60%)" },
  { id: "oceano", label: "Océano", rail: "#061321", side: "#0b1c2f", chat: "#0f2339", input: "#19344f", accent: "#3fa9ff", grad: "linear-gradient(200deg, rgba(63,169,255,.18), transparent 60%)" },
  { id: "bosque", label: "Bosque", rail: "#0b140c", side: "#111d12", chat: "#152418", input: "#203624", accent: "#6fd36b", grad: "linear-gradient(160deg, rgba(111,211,107,.14), transparent 60%)" },
];

export const isPremium = (p?: Profile | null) => !!p?.premium;

/** Clase y estilo del nombre (solo Premium). */
export function nameProps(p?: Profile | null, fallback?: string): { className: string; style: React.CSSProperties } {
  if (!p?.premium || !p.name_style) return { className: "", style: fallback ? { color: fallback } : {} };
  const c1 = p.name_c1 || p.color;
  const c2 = p.name_c2 || "#ffffff";
  return { className: `nm-${p.name_style}`, style: { ["--n1" as string]: c1, ["--n2" as string]: c2 } };
}

/** Aplica el tema de la app del usuario (variables CSS en <html>). */
export function applyAppTheme(p?: Profile | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const t = p?.premium ? THEMES.find((x) => x.id === p.app_theme) : undefined;
  const accent = p?.premium && p.app_accent ? p.app_accent : t?.accent;
  const vars: Record<string, string | undefined> = {
    "--rail": t?.rail,
    "--side": t?.side,
    "--chat": t?.chat,
    "--input-bg": t?.input,
    "--accent": accent,
    "--chat-grad": t?.grad,
  };
  for (const [k, v] of Object.entries(vars)) {
    if (v) root.style.setProperty(k, v);
    else root.style.removeProperty(k);
  }
  root.dataset.appTheme = t?.id ?? "";
}
