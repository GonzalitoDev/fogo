"use client";

import { BADGES, badgesFor, type BadgeId } from "@/lib/badges";
import { useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

/* ---------- íconos (16x16, color propio de cada insignia) ---------- */

const SHAPES: Record<BadgeId, React.ReactNode> = {
  fundador: <path d="M3 11.5 2 5l3.5 2.5L8 3l2.5 4.5L14 5l-1 6.5H3Zm0 1.5h10v1.5H3V13Z" />,
  staff: <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Zm-1 8.7 4-4-1-1-3 3-1.5-1.5-1 1L7 10.2Z" />,
  moderador: <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Zm0 2.2v8.9c2-.8 3.3-2.5 3.3-4.6V5.3L8 3.7Z" />,
  betatester: <path d="M6 2h4v1.2h-.6v3l3.4 5.6c.5.9-.1 2-1.1 2H4.3c-1 0-1.6-1.1-1.1-2l3.4-5.6v-3H6V2Zm1.8 1.2v3.4L6.4 9h3.2L8.2 6.6V3.2h-.4Z" />,
  cazabugs: <path d="M5.5 3.2 6.6 4.3a3.4 3.4 0 0 1 2.8 0l1.1-1.1.9.9-.9.9c.4.4.7.9.9 1.5H13v1.3h-1.4v1H13v1.3h-1.5a3.6 3.6 0 0 1-7 0H3V8.8h1.4v-1H3V6.5h1.6c.2-.6.5-1.1.9-1.5l-.9-.9.9-.9ZM7.4 8v4h1.2V8H7.4Z" />,
  dev: <path d="M5.3 4.2 1.5 8l3.8 3.8.9-.9L3.3 8l2.9-2.9-.9-.9Zm5.4 0-.9.9L12.7 8l-2.9 2.9.9.9L14.5 8l-3.8-3.8ZM9 2.5 5.8 13.5h1.3L10.2 2.5H9Z" />,
  artista: <path d="M8 1.8c3.4 0 6.2 2.4 6.2 5.3 0 1.7-1.4 3-3.1 3H9.8c-.6 0-1 .5-1 1 0 .3.1.5.3.7.2.2.3.5.3.8 0 .6-.5 1.1-1.2 1.1-3.4 0-6.2-2.8-6.2-6.2S4.6 1.8 8 1.8ZM4.8 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm2-2.7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3.2 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm2 2.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
  vip: <path d="M8 1.5 9.9 5.6l4.5.5-3.3 3 .9 4.4L8 11.3l-4 2.2.9-4.4-3.3-3 4.5-.5L8 1.5Z" />,
  embajador: <path d="M8 1.5 9.6 4.7l3.5.5-2.5 2.5.6 3.5L8 9.5l-3.2 1.7.6-3.5-2.5-2.5 3.5-.5L8 1.5ZM5.2 12.2 8 10.8l2.8 1.4.6 3.3L8 13.9l-3.4 1.6.6-3.3Z" />,
  premium: <path d="M4.5 2.5h7L14 6l-6 7.5L2 6l2.5-3.5Zm1 1.2L4 6h2.4l1-2.3H5.5Zm3.1 0 1 2.3H12l-1.5-2.3H8.6Zm-.6.4L7.1 6h1.8L8 4.1ZM4.1 7.2l2.8 3.5-1-3.5H4.1Zm3 0L8 10.6l.9-3.4H7.1Zm3 0-1 3.5 2.8-3.5h-1.8Z" />,
  pionero: <path d="M8 1.5c.6 1.9 2.6 2.7 2.6 5.4 0 .9-.3 1.6-.7 2.1.9-.2 1.6-.9 1.9-1.8.7.9 1.2 2 1.2 3.2A5 5 0 0 1 8 15a5 5 0 0 1-5-4.6c0-2.6 1.9-3.5 2.4-5.4.6.8.8 1.6.7 2.6C7.4 6.6 8.3 4.6 8 1.5Z" />,
};

export function BadgeIcon({ id, size = 16 }: { id: BadgeId; size?: number }) {
  const b = BADGES[id];
  return (
    <span className="insignia" style={{ ["--b" as string]: b.color, width: size + 4, height: size + 4 }} title={b.label} aria-label={b.label} role="img">
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {SHAPES[id]}
      </svg>
    </span>
  );
}

export function useBadges(p?: Profile | null) {
  const granted = useStore((s) => (p ? s.badges[p.id] : undefined));
  return p ? badgesFor(granted, p.created_at, p.premium) : [];
}

/** Fila chica al lado del nombre (mensajes, miembros). */
export function BadgeRow({ p, max = 3, size = 14 }: { p?: Profile | null; max?: number; size?: number }) {
  const list = useBadges(p);
  if (!list.length) return null;
  return (
    <span className="badge-row">
      {list.slice(0, max).map((b) => (
        <BadgeIcon key={b} id={b} size={size} />
      ))}
      {list.length > max && <span className="badge-more">+{list.length - max}</span>}
    </span>
  );
}

