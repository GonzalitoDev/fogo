/**
 * Soporte con IA usando Pollinations (sin API key, se llama desde el navegador).
 * Si Pollinations falla o tarda, cae en un clasificador local para que el reporte se pueda
 * mandar igual: nunca dejamos a la persona sin poder reportar.
 */

export type SupportCategory = "bug" | "acoso" | "spam" | "otro";
export type SupportUrgency = "baja" | "media" | "alta";

export type SupportDraft = {
  category: SupportCategory;
  urgency: SupportUrgency;
  summary: string;
  message: string;
};

const CATEGORIES: SupportCategory[] = ["bug", "acoso", "spam", "otro"];
const URGENCIES: SupportUrgency[] = ["baja", "media", "alta"];

const oneLine = (t: string, max: number) => t.replace(/\s+/g, " ").trim().slice(0, max);

/** Clasificación local por palabras (fallback cuando la IA no contesta). */
export function fallbackDraft(text: string): SupportDraft {
  const t = (text || "").toLowerCase();
  let category: SupportCategory = "otro";
  if (/(acoso|acosad|insult|amenaz|abuso|violencia|molest|doxx|privacidad|hacke)/.test(t)) category = "acoso";
  else if (/(spam|estafa|scam|publicidad|cuenta falsa|bot que)/.test(t)) category = "spam";
  else if (/(bug|error|no anda|no funciona|falla|roto|crash|no carga|pantalla|glitch|se cierra)/.test(t)) category = "bug";
  const urgency: SupportUrgency = category === "acoso" ? "alta" : category === "bug" ? "media" : "baja";
  return {
    category,
    urgency,
    summary: oneLine(text, 160) || "Reporte sin detalle",
    message: text.trim().slice(0, 1500),
  };
}

/** Lee la respuesta de la IA y valida el JSON; si vino cualquier cosa, usa el fallback. */
export function parseDraft(raw: string, original: string): SupportDraft {
  const fb = fallbackDraft(original);
  try {
    const s = (raw || "").replace(/```json/gi, "```").trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return fb;
    const o = JSON.parse(s.slice(a, b + 1)) as Partial<SupportDraft>;
    const category = CATEGORIES.includes(o.category as SupportCategory) ? (o.category as SupportCategory) : fb.category;
    const urgency = URGENCIES.includes(o.urgency as SupportUrgency) ? (o.urgency as SupportUrgency) : fb.urgency;
    return {
      category,
      urgency,
      summary: oneLine(String(o.summary ?? ""), 200) || fb.summary,
      message: String(o.message ?? "").trim().slice(0, 1500) || fb.message,
    };
  } catch {
    return fb;
  }
}

const SYSTEM = `Sos el asistente de soporte de Fogón, un Discord en español rioplatense.
Te paso el reporte de una persona. Devolvé SOLO un JSON válido, sin markdown ni texto extra, con esta forma:
{"category":"bug|acoso|spam|otro","urgency":"baja|media|alta","summary":"una frase corta","message":"mensaje claro y completo para el staff"}
Reglas: no inventes datos, no prometas nada, no pidas contraseñas. Si es acoso o amenaza, urgency alta.
El message va dirigido al staff y tiene que incluir lo importante del reporte.`;

/** Pide a Pollinations que clasifique y redacte el reporte. Nunca lanza: si falla, usa el fallback. */
export async function analyzeSupport(text: string, where?: string): Promise<SupportDraft> {
  if (!text.trim()) return fallbackDraft(text);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${where ? `Dónde pasó: ${where}\n` : ""}Reporte: ${text.slice(0, 2000)}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseDraft(j?.choices?.[0]?.message?.content ?? "", text);
  } catch {
    return fallbackDraft(text);
  } finally {
    clearTimeout(timer);
  }
}
