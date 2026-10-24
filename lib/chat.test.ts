import { describe, expect, it } from "vitest";
import { inline, isJumbo, parse } from "./markdown";
import { activeTrigger, buildRows, channelTree, filterProfiles, groupReactions, slugChannel, upsertMessage } from "./chat";
import type { Channel, Message } from "./types";

const msg = (id: string, author: string, at: string, extra: Partial<Message> = {}): Message => ({
  id, channel_id: "c", author_id: author, content: id, attachments: [], mentions: [], reply_to_id: null, created_at: at, edited_at: null, ...extra,
});

describe("markdown", () => {
  it("negrita, cursiva, código, tachado", () => {
    expect(inline("**hola** *che* `x` ~~no~~")).toEqual([
      { t: "bold", c: [{ t: "text", v: "hola" }] },
      { t: "text", v: " " },
      { t: "italic", c: [{ t: "text", v: "che" }] },
      { t: "text", v: " " },
      { t: "code", v: "x" },
      { t: "text", v: " " },
      { t: "strike", c: [{ t: "text", v: "no" }] },
    ]);
  });
  it("no rompe snake_case, emails ni URLs", () => {
    expect(inline("mi_var_x")).toEqual([{ t: "text", v: "mi_var_x" }]);
    expect(inline("ana@mail.com")).toEqual([{ t: "text", v: "ana@mail.com" }]);
    expect(inline("mirá https://x.com/a_b_c.")).toEqual([
      { t: "text", v: "mirá " },
      { t: "link", href: "https://x.com/a_b_c" },
      { t: "text", v: "." },
    ]);
  });
  it("menciones", () => {
    expect(inline("hola @Beto.")).toEqual([{ t: "text", v: "hola " }, { t: "mention", username: "beto" }, { t: "text", v: "." }]);
  });
  it("bloques de código no se formatean por dentro", () => {
    expect(parse("a\n```js\n**no** @x\n```b")).toEqual([
      { t: "text", v: "a" },
      { t: "br" },
      { t: "block", v: "**no** @x" },
      { t: "text", v: "b" },
    ]);
  });
  it("no deja pasar HTML (es texto)", () => {
    expect(inline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });
  it("solo emojis se ven grandes", () => {
    expect(isJumbo("🔥🔥")).toBe(true);
    expect(isJumbo("👍🏽")).toBe(true);
    expect(isJumbo("hola 🔥")).toBe(false);
    expect(isJumbo("123")).toBe(false);
  });
});

describe("mensajes", () => {
  it("agrupa por autor y corta por día, tiempo y respuestas", () => {
    const rows = buildRows([
      msg("1", "a", "2026-10-21T10:00:00Z"),
      msg("2", "a", "2026-10-21T10:03:00Z"),
      msg("3", "a", "2026-10-21T10:20:00Z"),
      msg("4", "b", "2026-10-21T10:21:00Z"),
      msg("5", "b", "2026-10-21T10:22:00Z", { reply_to_id: "1" }),
      msg("6", "b", "2026-10-22T10:22:00Z"),
    ]);
    const heads = rows.filter((r) => r.kind === "msg").map((r) => (r.kind === "msg" && r.head ? r.msg.id : "-"));
    expect(heads).toEqual(["1", "-", "3", "4", "5", "6"]);
    expect(rows.filter((r) => r.kind === "day")).toHaveLength(2);
  });
  it("el eco del servidor reemplaza al optimista sin duplicar", () => {
    const opt = { ...msg("x", "a", "2026-10-21T10:00:00Z"), status: "sending" as const };
    const list = upsertMessage([msg("0", "b", "2026-10-21T09:00:00Z")], opt);
    const after = upsertMessage(list, msg("x", "a", "2026-10-21T10:00:01Z"));
    expect(after).toHaveLength(2);
    expect(after[1].status).toBeUndefined();
  });
  it("reacciones agrupadas", () => {
    const g = groupReactions([
      { message_id: "m", user_id: "a", emoji: "🔥" },
      { message_id: "m", user_id: "b", emoji: "🔥" },
      { message_id: "m", user_id: "b", emoji: "😂" },
    ], "a");
    expect(g).toEqual([
      { emoji: "🔥", count: 2, mine: true, users: ["a", "b"] },
      { emoji: "😂", count: 1, mine: false, users: ["b"] },
    ]);
  });
});

describe("compositor", () => {
  it("detecta @ y # antes del cursor", () => {
    expect(activeTrigger("hola @be", 8)).toEqual({ char: "@", query: "be", start: 5 });
    expect(activeTrigger("@", 1)).toEqual({ char: "@", query: "", start: 0 });
    expect(activeTrigger("mail@x", 6)).toBeNull();
    expect(activeTrigger("ir a #gen", 9)).toEqual({ char: "#", query: "gen", start: 5 });
  });
  it("filtra perfiles priorizando prefijo", () => {
    const ps = [
      { id: "1", username: "roberto", display_name: "Rober", color: "#000000" },
      { id: "2", username: "beto", display_name: "Beto", color: "#000000" },
    ];
    expect(filterProfiles(ps, "be").map((p) => p.username)).toEqual(["beto", "roberto"]);
  });
  it("slug de canales", () => {
    expect(slugChannel("  Música y Películas!! ")).toBe("musica-y-peliculas");
  });
});

describe("canales", () => {
  it("agrupa por categoría en orden", () => {
    const ch = (id: string, kind: Channel["kind"], position: number, parent: string | null = null): Channel => ({
      id, server_id: "s", kind, name: id, topic: "", position, parent_id: parent, last_message_at: null, created_at: "2026-01-01",
    });
    const t = channelTree([ch("cat2", "category", 1), ch("cat1", "category", 0), ch("b", "text", 1, "cat1"), ch("a", "text", 0, "cat1"), ch("suelto", "text", 0), ch("c", "text", 0, "cat2")], "s");
    expect(t.groups.map((g) => [g.cat.id, g.items.map((i) => i.id)])).toEqual([["cat1", ["a", "b"]], ["cat2", ["c"]]]);
    expect(t.flat.map((c) => c.id)).toEqual(["suelto", "a", "b", "c"]);
  });
});

import { firstUnreadId } from "./chat";
import { typingText } from "./typing";

describe("línea de NUEVOS y escribiendo", () => {
  const mk = (id: string, author: string, min: number) => ({ id, channel_id: "c", author_id: author, content: "x", attachments: [], mentions: [], reply_to_id: null, created_at: new Date(Date.UTC(2026, 0, 1, 10, min)).toISOString(), edited_at: null });
  const list = [mk("a", "yo", 0), mk("b", "otro", 5), mk("c", "yo", 10), mk("d", "otro", 15)];
  it("marca el primer mensaje ajeno después de lo leído", () => {
    expect(firstUnreadId(list, new Date(Date.UTC(2026, 0, 1, 10, 7)).toISOString(), "yo")).toBe("d");
    expect(firstUnreadId(list, new Date(Date.UTC(2026, 0, 1, 10, 1)).toISOString(), "yo")).toBe("b");
    expect(firstUnreadId(list, null, "yo")).toBe(null);
    expect(firstUnreadId(list, new Date(Date.UTC(2026, 0, 1, 11)).toISOString(), "yo")).toBe(null);
  });
  it("arma la frase de quién escribe", () => {
    expect(typingText([])).toBe("");
    expect(typingText(["Beto"])).toBe("Beto está escribiendo…");
    expect(typingText(["Beto", "Ana"])).toBe("Beto y Ana están escribiendo…");
    expect(typingText(["A", "B", "C", "D"])).toBe("Varias personas están escribiendo…");
  });
});

import { channelAllows, getState, setState } from "./store";

describe("permisos por categoría", () => {
  it("@everyone denegado, un rol permitido, el canal suma encima", () => {
    const base = getState();
    setState({
      me: { id: "u", username: "u", display_name: "U", color: "#000" },
      servers: { s: { id: "s", name: "S", owner_id: "otro", invite_code: "x", created_at: "" } },
      channels: {
        cat: { id: "cat", server_id: "s", kind: "category", name: "staff", topic: "", position: 0, parent_id: null, last_message_at: null, created_at: "" },
        ch: { id: "ch", server_id: "s", kind: "text", name: "secreto", topic: "", position: 0, parent_id: "cat", last_message_at: null, created_at: "" },
      } as never,
      memberRoles: { s: { u: [] } },
      roles: {},
      overrides: { cat: [{ id: "1", server_id: "s", channel_id: "cat", role_id: null, allow: [], deny: ["view_channel"] }] },
    });
    expect(channelAllows(getState(), "ch", "view_channel")).toBe(false);
    expect(channelAllows(getState(), "ch", "send_messages")).toBe(false);
    setState({ memberRoles: { s: { u: ["staff"] } }, overrides: { ...getState().overrides, cat: [...getState().overrides.cat, { id: "2", server_id: "s", channel_id: "cat", role_id: "staff", allow: ["view_channel"], deny: [] }] } });
    expect(channelAllows(getState(), "ch", "view_channel")).toBe(true);
    setState({ overrides: { ...getState().overrides, ch: [{ id: "3", server_id: "s", channel_id: "ch", role_id: null, allow: [], deny: ["send_messages"] }] } });
    expect(channelAllows(getState(), "ch", "send_messages")).toBe(false);
    expect(channelAllows(getState(), "ch", "view_channel")).toBe(true);
    setState(base);
  });
});
