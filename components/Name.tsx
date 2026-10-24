"use client";

import { nameProps } from "@/lib/premium";
import type { Profile } from "@/lib/types";

/** Nombre visible con el estilo Premium (degradé, brillo, arcoíris) si lo tiene. */
export function Name({ p, color, fallback = "…" }: { p?: Profile | null; color?: string; fallback?: string }) {
  const { className, style } = nameProps(p, color);
  return (
    <span className={`uname ${className}`} style={style}>
      {p?.display_name ?? fallback}
    </span>
  );
}
