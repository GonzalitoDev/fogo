// Ayudas de seguridad de cuenta: fuerza de la contraseña y nombre legible del dispositivo.

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "contraseña", "contrasena", "qwerty123", "qwertyuiop",
  "11111111", "00000000", "abc12345", "iloveyou", "argentina", "bocajuniors", "riverplate", "fogon123", "asdfghjk",
]);

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; problem: string | null };

/** Qué tan fuerte es la contraseña. `problem` no nulo = no se puede usar. */
export function passwordStrength(pass: string, email = ""): Strength {
  const p = pass.trim();
  const user = email.split("@")[0].toLowerCase();
  let problem: string | null = null;
  if (p.length < 8) problem = "Tiene que tener al menos 8 caracteres.";
  else if (COMMON.has(p.toLowerCase())) problem = "Esa contraseña es muy común. Elegí otra.";
  else if (user.length >= 3 && p.toLowerCase().includes(user)) problem = "No uses tu email dentro de la contraseña.";
  else if (/^(.)\1+$/.test(p)) problem = "No repitas el mismo carácter.";
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let score = problem ? (p.length ? 1 : 0) : Math.min(4, (p.length >= 12 ? 2 : 1) + (kinds >= 3 ? 1 : 0) + (p.length >= 16 || kinds === 4 ? 1 : 0));
  if (!p.length) score = 0;
  const label = ["", "Débil", "Aceptable", "Buena", "Muy fuerte"][score];
  return { score: score as Strength["score"], label, problem };
}

/** "Navegador en sistema" a partir del user agent, lo justo para reconocer el dispositivo. */
export function deviceName(ua: string | null | undefined) {
  if (!ua) return "Dispositivo desconocido";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} en ${os}` : browser;
}
