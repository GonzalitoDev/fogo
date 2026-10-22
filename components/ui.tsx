"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat";
import type { Profile } from "@/lib/types";

export const COLORS = ["#e07a3f", "#d4a72c", "#4f9d69", "#2f9c95", "#3f7fd1", "#7a63d6", "#c4569b", "#d0504a", "#6b7b77"];

export function Avatar({ p, size = "md" }: { p?: Profile | null; size?: "md" | "sm" | "xs" }) {
  return (
    <span className={`avatar ${size === "md" ? "" : size}`} style={{ ["--c" as string]: p?.color ?? "#6b7b77" }} aria-hidden="true">
      {initials(p?.display_name ?? "?")}
    </span>
  );
}

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

export function Modal(p: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEscape(p.onClose);
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

export type MenuItem = { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void } | "sep";

export function Menu(p: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void; label: string }) {
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
        className="menu"
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
              className={it.danger ? "danger" : ""}
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

export function EmojiPicker(p: { at: { x: number; y: number }; onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
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
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                p.onPick(e);
                p.onClose();
              }}
              aria-label={`Reaccionar con ${e}`}
            >
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
