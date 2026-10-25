import { describe, expect, it } from "vitest";
import { fallbackDraft, parseDraft } from "./ai";

describe("fallbackDraft", () => {
  it("detecta un bug", () => {
    const d = fallbackDraft("hay un bug, no carga el chat");
    expect(d.category).toBe("bug");
    expect(d.urgency).toBe("media");
  });
  it("detecta acoso y lo marca urgente", () => {
    const d = fallbackDraft("me insultan y me amenazan por privado");
    expect(d.category).toBe("acoso");
    expect(d.urgency).toBe("alta");
  });
  it("detecta spam", () => {
    expect(fallbackDraft("una cuenta manda publicidad y estafas").category).toBe("spam");
  });
  it("deja el resto como otro con el texto original", () => {
    const d = fallbackDraft("quiero cambiar mi color de nombre");
    expect(d.category).toBe("otro");
    expect(d.message).toContain("color de nombre");
  });
});

describe("parseDraft", () => {
  it("lee el JSON aunque venga con markdown", () => {
    const d = parseDraft('```json\n{"category":"spam","urgency":"alta","summary":"Spam en general","message":"Baneen a la cuenta"}\n```', "texto");
    expect(d).toEqual({ category: "spam", urgency: "alta", summary: "Spam en general", message: "Baneen a la cuenta" });
  });
  it("si no es JSON usa el fallback", () => {
    const d = parseDraft("uf, no sé", "hay un bug que no carga");
    expect(d.category).toBe("bug");
    expect(d.summary).toContain("bug");
  });
  it("valida categorías y urgencias raras", () => {
    const d = parseDraft('{"category":"nada","urgency":"media","summary":"","message":""}', "me amenazan");
    expect(d.category).toBe("acoso");
    expect(d.urgency).toBe("media");
    expect(d.message).toBe("me amenazan");
  });
});
