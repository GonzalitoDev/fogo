"use client";

import { useMemo, useState } from "react";
import { go, useStore } from "@/lib/store";
import { Icon } from "./Icon";
import { Avatar, useEscape } from "./ui";

export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const channels = useStore((s) => s.channels);
  const servers = useStore((s) => s.servers);
  const peers = useStore((s) => s.dmPeers);
  const profiles = useStore((s) => s.profiles);
  const unread = useStore((s) => s.unread);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  useEscape(onClose);

  const items = useMemo(() => {
    const n = q.toLowerCase().replace(/^[#@]/, "");
    return Object.values(channels)
      .filter((c) => c.kind !== "category")
      .map((c) => {
        const peer = c.kind === "dm" ? profiles[peers[c.id]] : undefined;
        const label = c.kind === "dm" ? peer?.display_name ?? "" : c.name;
        const extra = c.kind === "dm" ? peer?.username ?? "" : "";
        return { c, peer, label, where: c.server_id ? servers[c.server_id]?.name ?? "" : "Mensaje directo", hay: `${label} ${extra}`.toLowerCase() };
      })
      .filter((x) => x.label && (!n || x.hay.includes(n)))
      .sort((a, b) => Number(!!unread[b.c.id]?.unread) - Number(!!unread[a.c.id]?.unread) || (b.c.last_message_at ?? "").localeCompare(a.c.last_message_at ?? ""))
      .slice(0, 9);
  }, [q, channels, servers, peers, profiles, unread]);

  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    if (it.c.kind === "dm") go({ kind: "dm", channelId: it.c.id });
    else go({ kind: "server", serverId: it.c.server_id!, channelId: it.c.id });
    onClose();
  };

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="switcher" role="dialog" aria-modal="true" aria-label="Ir a un canal o charla">
        <input
          id="switcher"
          className="input"
          autoFocus
          placeholder="¿A dónde querés ir?"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
            if (e.key === "Enter") (e.preventDefault(), pick(sel));
          }}
          aria-controls="switcher-list"
        />
        <div id="switcher-list" role="listbox">
          {items.map((it, i) => (
            <button key={it.c.id} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
              {it.c.kind === "dm" ? <Avatar p={it.peer} size="xs" /> : <Icon name={it.c.kind === "voice" ? "speaker" : "hash"} />}
              <span style={{ fontWeight: unread[it.c.id]?.unread ? 700 : 500 }}>{it.label}</span>
              <span className="where">{it.where}</span>
            </button>
          ))}
          {!items.length && <p className="hint" style={{ padding: "8px 10px", margin: 0 }}>No hay canales ni charlas con ese nombre.</p>}
        </div>
      </div>
    </div>
  );
}
