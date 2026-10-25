"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { initials } from "@/lib/chat";
import type { Presence, Profile } from "@/lib/types";
import { emojiToken, mediaUrl, usableEmojis, useStore } from "@/lib/store";
import { Ember } from "./Icon";
import { AvatarDecoration } from "./Deco";

export const COLORS = ["#e07a3f", "#d4a72c", "#4f9d69", "#2f9c95", "#3f7fd1", "#7a63d6", "#c4569b", "#d0504a", "#6b7b77"];

export function Avatar({ p, size = "md", status, src: override }: { p?: Profile | null; size?: "md" | "sm" | "xs" | "lg" | "xl"; status?: Presence; src?: string | null }) {
  const src = override !== undefined ? override : mediaUrl(p?.avatar_path);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span className={`avatar ${size === "md" ? "" : size}${src && !broken ? " has-img" : ""}`} style={{ ["--c" as string]: p?.color ?? "#6b7b77" }} aria-hidden="true">
      {p?.is_official ? <Ember className="official-ember" /> : src && !broken ? <img src={src} alt="" draggable={false} onError={() => setBroken(true)} /> : initials(p?.display_name ?? "?")}
      {p?.avatar_deco && size !== "xs" && <AvatarDecoration id={p.avatar_deco} />}
      {status && <span className={`status-dot s-${status}`} title={STATUS_LABEL[status]} />}
    </span>
  );
}

export const STATUS_LABEL: Record<Presence, string> = { online: "En línea", idle: "Ausente", dnd: "No molestar", offline: "Desconectado" };

export function useEscape(fn: () => void, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        ref.current();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [active]);
}

/** Dentro de los ajustes a pantalla completa, los diálogos se dibujan como una sección más. */
export const InlineModal = createContext(false);

export function Modal(p: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const inline = useContext(InlineModal);
  useEscape(p.onClose, !inline);
  if (inline)
    return (
      <div className="inline-modal" aria-label={p.label}>
        {p.children}
      </div>
    );
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={p.label} style={p.wide ? { width: 560 } : undefined}>
        {p.children}
      </div>
    </div>
  );
}

export function Confirm(p: { title: string; text: string; action: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal label={p.title} onClose={p.onClose}>
      <h2>{p.title}</h2>
      <p>{p.text}</p>
      <div className="foot">
        <button className="btn ghost" onClick={p.onClose}>
          Cancelar
        </button>
        <button
          className={`btn ${p.danger ? "danger" : "primary"}`}
          disabled={busy}
          autoFocus
          onClick={async () => {
            setBusy(true);
            try {
              await p.onConfirm();
              p.onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {p.action}
        </button>
      </div>
    </Modal>
  );
}

export type MenuItem = { label: string; icon?: React.ReactNode; danger?: boolean; accent?: boolean; onClick: () => void } | "sep";

export function Menu(p: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: p.at.x, top: p.at.y, ready: false });
  useEscape(p.onClose);
  useLayoutEffect(() => {
    const el = ref.current!;
    const left = Math.min(p.at.x, window.innerWidth - el.offsetWidth - 8);
    const top = Math.min(p.at.y, window.innerHeight - el.offsetHeight - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top), ready: true });
    el.querySelector("button")?.focus();
  }, [p.at.x, p.at.y]);
  return (
    <>
      <div className="backdrop" onPointerDown={p.onClose} />
      <div
        ref={ref}
        className={"menu" + (p.className ? " " + p.className : "")}
        role="menu"
        aria-label={p.label}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
        onKeyDown={(e) => {
          const btns = [...(ref.current?.querySelectorAll("button") ?? [])];
          const i = btns.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === "ArrowDown") (btns[(i + 1) % btns.length] as HTMLElement).focus();
          if (e.key === "ArrowUp") (btns[(i - 1 + btns.length) % btns.length] as HTMLElement).focus();
        }}
      >
        {p.items.map((it, i) =>
          it === "sep" ? (
            <hr key={i} />
          ) : (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? "danger" : it.accent ? "accent" : ""}
              onClick={() => {
                p.onClose();
                it.onClick();
              }}
            >
              {it.label}
              {it.icon}
            </button>
          ),
        )}
      </div>
    </>
  );
}

export const EMOJIS = [
  "👍", "❤️", "😂", "🔥", "🙌", "😮", "😢", "🎉",
  "👀", "💯", "🤝", "🙏", "😎", "🤔", "😅", "🥲",
  "😡", "🤯", "🥳", "😴", "💀", "✅", "❌", "⭐",
  "🧉", "🍕", "⚽", "🎮", "💻", "🐛", "🚀", "☕",
];

export function EmojiPicker(p: { at: { x: number; y: number }; onPick: (e: string) => void; onClose: () => void; noCustom?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const servers = useStore((s) => s.servers);
  const emojis = useStore((s) => s.emojis);
  const me = useStore((s) => s.me);
  const place = useStore((s) => s.place);
  const serverId = place.kind === "server" ? place.serverId : null;
  const premium = !!me?.premium;
  const groups = useMemo(
    () => (p.noCustom ? [] : usableEmojis({ servers, emojis, me } as Parameters<typeof usableEmojis>[0], serverId)),
    [servers, emojis, me, serverId, p.noCustom],
  );
  const pick = (e: string) => {
    p.onPick(e);
    p.onClose();
  };
  const [pos, setPos] = useState({ left: p.at.x, top: p.at.y, ready: false });
  useEscape(p.onClose);
  useLayoutEffect(() => {
    const el = ref.current!;
    const left = Math.min(Math.max(8, p.at.x - el.offsetWidth), window.innerWidth - el.offsetWidth - 8);
    let top = p.at.y - el.offsetHeight - 8;
    if (top < 8) top = Math.min(p.at.y + 8, window.innerHeight - el.offsetHeight - 8);
    setPos({ left, top, ready: true });
    (el.querySelector("button") as HTMLElement | null)?.focus();
  }, [p.at.x, p.at.y]);
  return (
    <>
      <div className="backdrop" onPointerDown={p.onClose} />
      <div ref={ref} className="emoji-pop" role="dialog" aria-label="Elegir reacción" style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}>
        {groups.map((g) => (
          <div key={g.server.id} className="emoji-sec">
            <div className="emoji-sec-h">{g.server.name}</div>
            <div className="emoji-grid">
              {g.list.map((e) => (
                <button key={e.id} onClick={() => pick(emojiToken(e))} aria-label={`:${e.name}:`} title={`:${e.name}:`}>
                  <img className="cemoji" src={mediaUrl(e.path) ?? ""} alt="" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {!premium && !p.noCustom && Object.keys(emojis).some((id) => emojis[id].server_id !== serverId && servers[emojis[id].server_id]) && (
          <div className="emoji-upsell">Con Fogón Premium usás los emojis de todos tus servidores.</div>
        )}
        {groups.length > 0 && <div className="emoji-sec-h">Emojis</div>}
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => pick(e)} aria-label={`Reaccionar con ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
