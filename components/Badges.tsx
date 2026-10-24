"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BADGES, badgesFor, GRANTABLE, type BadgeId } from "@/lib/badges";
import { rolesOf, setBadge, useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Avatar, useEscape } from "./ui";

/* ---------- íconos (16x16, color propio de cada insignia) ---------- */

const SHAPES: Record<BadgeId, React.ReactNode> = {
  fundador: <path d="M3 11.5 2 5l3.5 2.5L8 3l2.5 4.5L14 5l-1 6.5H3Zm0 1.5h10v1.5H3V13Z" />,
  staff: <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Zm-1 8.7 4-4-1-1-3 3-1.5-1.5-1 1L7 10.2Z" />,
  moderador: <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Zm0 2.2v8.9c2-.8 3.3-2.5 3.3-4.6V5.3L8 3.7Z" />,
  cazabugs: <path d="M5.5 3.2 6.6 4.3a3.4 3.4 0 0 1 2.8 0l1.1-1.1.9.9-.9.9c.4.4.7.9.9 1.5H13v1.3h-1.4v1H13v1.3h-1.5a3.6 3.6 0 0 1-7 0H3V8.8h1.4v-1H3V6.5h1.6c.2-.6.5-1.1.9-1.5l-.9-.9.9-.9ZM7.4 8v4h1.2V8H7.4Z" />,
  dev: <path d="M5.3 4.2 1.5 8l3.8 3.8.9-.9L3.3 8l2.9-2.9-.9-.9Zm5.4 0-.9.9L12.7 8l-2.9 2.9.9.9L14.5 8l-3.8-3.8ZM9 2.5 5.8 13.5h1.3L10.2 2.5H9Z" />,
  artista: <path d="M8 1.8c3.4 0 6.2 2.4 6.2 5.3 0 1.7-1.4 3-3.1 3H9.8c-.6 0-1 .5-1 1 0 .3.1.5.3.7.2.2.3.5.3.8 0 .6-.5 1.1-1.2 1.1-3.4 0-6.2-2.8-6.2-6.2S4.6 1.8 8 1.8ZM4.8 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm2-2.7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3.2 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm2 2.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
  vip: <path d="M8 1.5 9.9 5.6l4.5.5-3.3 3 .9 4.4L8 11.3l-4 2.2.9-4.4-3.3-3 4.5-.5L8 1.5Z" />,
  pionero: <path d="M8 1.5c.6 1.9 2.6 2.7 2.6 5.4 0 .9-.3 1.6-.7 2.1.9-.2 1.6-.9 1.9-1.8.7.9 1.2 2 1.2 3.2A5 5 0 0 1 8 15a5 5 0 0 1-5-4.6c0-2.6 1.9-3.5 2.4-5.4.6.8.8 1.6.7 2.6C7.4 6.6 8.3 4.6 8 1.5Z" />,
};

export function BadgeIcon({ id, size = 16 }: { id: BadgeId; size?: number }) {
  const b = BADGES[id];
  return (
    <span className="badge" style={{ ["--b" as string]: b.color, width: size + 4, height: size + 4 }} title={b.label} aria-label={b.label} role="img">
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {SHAPES[id]}
      </svg>
    </span>
  );
}

export function useBadges(p?: Profile | null) {
  const granted = useStore((s) => (p ? s.badges[p.id] : undefined));
  return p ? badgesFor(granted, p.created_at) : [];
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

/* ---------- tarjeta de perfil ---------- */

export type CardAction = { label: string; onClick: () => void; primary?: boolean };

export function ProfileCard({ p, at, serverId, actions, onClose }: { p: Profile; at: { x: number; y: number }; serverId?: string; actions: CardAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y, ready: false });
  const list = useBadges(p);
  const isAdmin = useStore((s) => s.isAdmin);
  const grantedRaw = useStore((s) => s.badges[p.id]);
  const granted = grantedRaw ?? [];
  const st = useStore((s) => s);
  const roles = serverId ? rolesOf(st, serverId, p.id) : [];
  const [editing, setEditing] = useState(false);
  useEscape(onClose);
  useLayoutEffect(() => {
    const el = ref.current!;
    const left = Math.min(Math.max(8, at.x + 12), window.innerWidth - el.offsetWidth - 8);
    const top = Math.min(Math.max(8, at.y - 40), window.innerHeight - el.offsetHeight - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top), ready: true });
  }, [at.x, at.y, editing]);
  const since = p.created_at ? new Date(p.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <>
      <div className="backdrop" onPointerDown={onClose} />
      <div ref={ref} className="pcard" role="dialog" aria-label={`Perfil de ${p.display_name}`} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden", ["--c" as string]: p.color }}>
        <div className="pcard-banner" />
        <div className="pcard-head">
          <span className="pcard-avatar">
            <Avatar p={p} />
          </span>
          {list.length > 0 && (
            <div className="pcard-badges" aria-label="Insignias">
              {list.map((b) => (
                <span key={b} className="pcard-badge" tabIndex={0}>
                  <BadgeIcon id={b} size={18} />
                  <span className="tip" role="tooltip">
                    <b>{BADGES[b].label}</b>
                    {BADGES[b].desc}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="pcard-body">
          <h2>{p.display_name}</h2>
          <span className="hint">@{p.username}</span>
          {since && (
            <section>
              <h3>Miembro de Fogón desde</h3>
              <p>{since}</p>
            </section>
          )}
          {roles.length > 0 && (
            <section>
              <h3>Roles</h3>
              <div className="pcard-roles">
                {roles.map((r) => (
                  <span key={r.id} className="pcard-role" style={{ ["--rc" as string]: r.color || "var(--ink-3)" }}>
                    {r.name}
                  </span>
                ))}
              </div>
            </section>
          )}
          {isAdmin && (
            <section>
              <h3>
                Insignias (admin)
                <button className="link-btn" onClick={() => setEditing(!editing)}>
                  {editing ? "Listo" : "Editar"}
                </button>
              </h3>
              {editing && (
                <div className="badge-edit">
                  {GRANTABLE.map((b) => {
                    const on = granted.includes(b);
                    return (
                      <label key={b} className={"badge-toggle" + (on ? " on" : "")}>
                        <input type="checkbox" checked={on} onChange={(e) => void setBadge(p.id, b, e.target.checked)} />
                        <BadgeIcon id={b} size={14} />
                        {BADGES[b].label}
                      </label>
                    );
                  })}
                  <p className="hint">«Pionero» se da sola a quien se sumó en el primer mes.</p>
                </div>
              )}
            </section>
          )}
          {actions.length > 0 && (
            <div className="pcard-actions">
              {actions.map((a) => (
                <button
                  key={a.label}
                  className={"btn " + (a.primary ? "primary" : "ghost")}
                  onClick={() => {
                    onClose();
                    a.onClick();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
