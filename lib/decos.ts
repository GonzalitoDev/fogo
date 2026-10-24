// Decoraciones de avatar (gratis para todos), agrupadas en colecciones como una tienda.
// Los ids tienen que coincidir con el check de fogon_profiles.avatar_deco en la base.
export type AvatarDeco =
  | "fuego" | "corona" | "neon" | "corazones" | "estrellas" | "hojas"
  | "fogata" | "mate" | "orejas_gato" | "aureola" | "cuernitos" | "auriculares" | "flores" | "rayos"
  | "burbujas" | "nieve" | "arcoiris" | "petalos" | "pixel" | "galaxia";

export const DECO_COLLECTIONS: { id: string; title: string; desc: string; items: { id: AvatarDeco; label: string }[] }[] = [
  {
    id: "fogon",
    title: "Fogón",
    desc: "Las de la casa.",
    items: [
      { id: "fogata", label: "Fogata" },
      { id: "fuego", label: "Aro de fuego" },
      { id: "mate", label: "Mate" },
      { id: "estrellas", label: "Noche estrellada" },
    ],
  },
  {
    id: "tiernas",
    title: "Tiernas",
    desc: "Para los que vienen en son de paz.",
    items: [
      { id: "orejas_gato", label: "Orejas de gato" },
      { id: "aureola", label: "Aureola" },
      { id: "corazones", label: "Corazones" },
      { id: "burbujas", label: "Burbujas" },
    ],
  },
  {
    id: "naturaleza",
    title: "Naturaleza",
    desc: "Un poco de aire libre.",
    items: [
      { id: "flores", label: "Corona de flores" },
      { id: "petalos", label: "Pétalos" },
      { id: "hojas", label: "Hojas" },
      { id: "nieve", label: "Nieve" },
    ],
  },
  {
    id: "gamer",
    title: "Gamer",
    desc: "Para las partidas largas.",
    items: [
      { id: "auriculares", label: "Auriculares" },
      { id: "pixel", label: "Píxel" },
      { id: "neon", label: "Neón" },
      { id: "rayos", label: "Rayos" },
    ],
  },
  {
    id: "misticas",
    title: "Místicas",
    desc: "Con un toque de magia.",
    items: [
      { id: "galaxia", label: "Galaxia" },
      { id: "arcoiris", label: "Arcoíris" },
      { id: "corona", label: "Corona" },
      { id: "cuernitos", label: "Cuernitos" },
    ],
  },
];

export const ALL_DECOS: AvatarDeco[] = DECO_COLLECTIONS.flatMap((c) => c.items.map((i) => i.id));
export const decoLabel = (id: string) => DECO_COLLECTIONS.flatMap((c) => c.items).find((i) => i.id === id)?.label ?? id;
