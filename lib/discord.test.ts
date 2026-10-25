import { describe, expect, it } from "vitest";
import { mapDiscordTemplate, parseDiscordLink, permsFromDiscord } from "./discord";

const template = {
  name: "Mi comunidad",
  description: "Una plantilla de prueba",
  serialized_source_guild: {
    name: "Mi comunidad",
    roles: [
      { id: "r0", name: "@everyone", color: 0, position: 0, permissions: "104324673", managed: false },
      { id: "r1", name: "Admin", color: 0xff0000, position: 5, permissions: "8", hoist: true, managed: false },
      { id: "r2", name: "Mod", color: 0, position: 3, permissions: "8194", hoist: false, managed: false },
      { id: "r3", name: "Bot de música", color: 0, position: 2, permissions: "0", managed: true },
    ],
    channels: [
      { id: "c1", type: 4, name: "INFORMACIÓN", position: 0 },
      { id: "c2", type: 0, name: "reglas", parent_id: "c1", position: 1, topic: "Leé antes de entrar" },
      { id: "c3", type: 15, name: "foro-dudas", parent_id: "c1", position: 2 },
      { id: "c4", type: 4, name: "VOZ", position: 1 },
      { id: "c5", type: 2, name: "General", parent_id: "c4", position: 0 },
      { id: "c6", type: 11, name: "un-hilo", parent_id: "c1", position: 3 },
      { id: "c7", type: 0, name: "sin-categoria", position: 4 },
    ],
  },
};

describe("parseDiscordLink", () => {
  it("acepta discord.new, discord.com/template y el código pelado", () => {
    expect(parseDiscordLink("https://discord.new/HnqY8F9hDxgC")).toBe("HnqY8F9hDxgC");
    expect(parseDiscordLink("https://discord.com/template/HnqY8F9hDxgC?foo=1")).toBe("HnqY8F9hDxgC");
    expect(parseDiscordLink(" HnqY8F9hDxgC ")).toBe("HnqY8F9hDxgC");
  });
  it("rechaza cualquier otra cosa", () => {
    expect(parseDiscordLink("https://example.com/x")).toBeNull();
    expect(parseDiscordLink("")).toBeNull();
    expect(parseDiscordLink("hola mundo")).toBeNull();
  });
});

describe("permsFromDiscord", () => {
  it("administrator gana sobre todo", () => {
    expect(permsFromDiscord("8")).toEqual(["administrator"]);
    expect(permsFromDiscord("8200")).toEqual(["administrator"]);
  });
  it("traduce los bits que existen en Fogón", () => {
    expect(permsFromDiscord("8194")).toEqual(["kick_members", "manage_messages"]);
    expect(permsFromDiscord("0")).toEqual([]);
    expect(permsFromDiscord(undefined)).toEqual([]);
  });
});

describe("mapDiscordTemplate", () => {
  const p = mapDiscordTemplate(template);

  it("usa el nombre y la descripción", () => {
    expect(p.name).toBe("Mi comunidad");
    expect(p.description).toBe("Una plantilla de prueba");
  });

  it("descarta @everyone y los roles de bots", () => {
    expect(p.structure.roles.map((r) => r.name)).toEqual(["Admin", "Mod"]);
    expect(p.structure.roles[0]).toMatchObject({ color: "#ff0000", perms: ["administrator"] });
    expect(p.structure.roles[1].perms).toEqual(["kick_members", "manage_messages"]);
  });

  it("agrupa canales por categoría y traduce los tipos", () => {
    expect(p.structure.categories.map((c) => c.name)).toEqual(["INFORMACIÓN", "VOZ"]);
    expect(p.structure.categories[0].channels.map((c) => `${c.kind}:${c.name}`)).toEqual(["text:reglas", "text:foro-dudas"]);
    expect(p.structure.categories[1].channels).toEqual([{ kind: "voice", name: "General", topic: undefined, position: 0 }]);
    expect(p.structure.loose.map((c) => c.name)).toEqual(["sin-categoria"]);
  });

  it("cuenta lo que trae y lo que saltea", () => {
    expect(p.counts).toEqual({ roles: 2, categories: 2, text: 3, voice: 1, skipped: 1 });
    expect(p.sample).toContain("# reglas");
    expect(p.sample).toContain("🔊 General");
  });

  it("tolera un JSON vacío", () => {
    const empty = mapDiscordTemplate({});
    expect(empty.name).toBe("Servidor de Discord");
    expect(empty.structure.roles).toEqual([]);
    expect(empty.structure.categories).toEqual([]);
  });
});
