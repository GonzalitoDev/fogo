"use client";

import { useMemo, useState } from "react";
import { channelTree } from "@/lib/chat";
import { dmUnread, go, serverUnread, signOut, useStore, type State } from "@/lib/store";
import type { Channel, Server } from "@/lib/types";
import { Ember, Icon } from "./Icon";
import { Avatar, Menu, type MenuItem } from "./ui";

export type NavDialogs = {
  createServer: () => void;
  invite: (s: Server) => void;
  serverSettings: (s: Server) => void;
  channelEdit: (c: Partial<Channel> & { server_id: string; kind: "text" | "category" }) => void;
  confirmLeave: (s: Server) => void;
  newDm: () => void;
  profile: () => void;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function Rail({ dialogs }: { dialogs: NavDialogs; onNavigate?: () => void }) {
  const servers = useStore((s) => s.servers);
  const place = useStore((s) => s.place);
  const state = useStore((s) => s);
  const list = useMemo(() => Object.values(servers).sort((a, b) => a.created_at.localeCompare(b.created_at)), [servers]);
  const dmCount = dmUnread(state);
  return (
    <nav className="rail" aria-label="Servidores">
      <div className={`rail-item${place.kind === "dm" ? " active" : ""}`}>
        <span className="rail-pill" />
        <button
          className="rail-btn"
          onClick={() => go({ kind: "dm", channelId: null })}
          aria-label="Mensajes directos"
          title="Mensajes directos"
        >
          <Ember />
        </button>
        {dmCount > 0 && <span className="badge">{dmCount}</span>}
      </div>
      <div className="rail-sep" />
      {list.map((s) => {
        const u = serverUnread(state, s.id);
        const active = place.kind === "server" && place.serverId === s.id;
        return (
          <div key={s.id} className={`rail-item${active ? " active" : ""}${u.unread ? " unread" : ""}`}>
            <span className="rail-pill" />
            <button
              className="rail-btn"
              onClick={() => {
                go({ kind: "server", serverId: s.id, channelId: null });
              }}
              aria-label={`${s.name}${u.mentions ? `, ${u.mentions} menciones` : u.unread ? ", mensajes sin leer" : ""}`}
              title={s.name}
            >
              {initialsOf(s.name)}
            </button>
            {u.mentions > 0 && <span className="badge">{u.mentions}</span>}
          </div>
        );
      })}
      <div className="rail-item">
        <button className="rail-btn add" onClick={dialogs.createServer} aria-label="Crear o unirse a un servidor" title="Crear o unirse a un servidor">
          <Icon name="plus" />
        </button>
      </div>
    </nav>
  );
}

function MePanel({ dialogs }: { dialogs: NavDialogs }) {
  const me = useStore((s) => s.me);
  return (
    <div className="me-panel">
      <Avatar p={me} size="sm" />
      <div className="who">
        <b>{me?.display_name}</b>
        <span>@{me?.username}</span>
      </div>
      <button className="icon-btn" onClick={dialogs.profile} aria-label="Editar perfil" title="Editar perfil">
        <Icon name="gear" />
      </button>
      <button className="icon-btn" onClick={() => void signOut()} aria-label="Cerrar sesión" title="Cerrar sesión">
        <Icon name="logout" />
      </button>
    </div>
  );
}

function ChannelRow({ c, active, owner, onEdit, onPick, unread }: { c: Channel; active: boolean; owner: boolean; onEdit: () => void; onPick: () => void; unread: State["unread"][string] | undefined }) {
  return (
    <div className={`chan${active ? " active" : ""}${unread?.unread && !active ? " unread" : ""}`}>
      <Icon name="hash" className="hash" />
      <button className="label" onClick={onPick} aria-current={active ? "page" : undefined}>
        {c.name}
      </button>
      {unread && unread.mentions > 0 && !active && <span className="badge">{unread.mentions}</span>}
      {owner && (
        <button className="icon-btn" onClick={onEdit} aria-label={`Editar #${c.name}`} title="Editar canal">
          <Icon name="gear" />
        </button>
      )}
    </div>
  );
}

export function ServerSidebar({ server, dialogs, onNavigate }: { server: Server; dialogs: NavDialogs; onNavigate: () => void }) {
  const channels = useStore((s) => s.channels);
  const unread = useStore((s) => s.unread);
  const place = useStore((s) => s.place);
  const me = useStore((s) => s.me);
  const owner = me?.id === server.owner_id;
  const tree = useMemo(() => channelTree(Object.values(channels), server.id), [channels, server.id]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const pick = (c: Channel) => {
    go({ kind: "server", serverId: server.id, channelId: c.id });
    onNavigate();
  };
  const row = (c: Channel) => (
    <ChannelRow
      key={c.id}
      c={c}
      active={place.channelId === c.id}
      owner={owner}
      unread={unread[c.id]}
      onPick={() => pick(c)}
      onEdit={() => dialogs.channelEdit({ ...c, server_id: server.id, kind: "text" })}
    />
  );
  const items: MenuItem[] = [
    { label: "Invitar gente", icon: <Icon name="link" />, onClick: () => dialogs.invite(server) },
    ...(owner
      ? ([
          { label: "Crear canal", icon: <Icon name="hash" />, onClick: () => dialogs.channelEdit({ server_id: server.id, kind: "text", name: "", parent_id: tree.groups[0]?.cat.id ?? null }) },
          { label: "Crear categoría", icon: <Icon name="folder" />, onClick: () => dialogs.channelEdit({ server_id: server.id, kind: "category", name: "", position: tree.groups.length }) },
          { label: "Ajustes del servidor", icon: <Icon name="gear" />, onClick: () => dialogs.serverSettings(server) },
        ] as MenuItem[])
      : ([
          "sep",
          { label: "Salir del servidor", icon: <Icon name="door" />, danger: true, onClick: () => dialogs.confirmLeave(server) },
        ] as MenuItem[])),
  ];

  return (
    <aside className="side" aria-label={`Canales de ${server.name}`}>
      <div className="side-head">
        <button
          className="name"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 6 });
          }}
          aria-haspopup="menu"
          aria-expanded={!!menu}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{server.name}</span>
          <Icon name="chevron" />
        </button>
        <button className="icon-btn" onClick={() => dialogs.invite(server)} aria-label="Invitar gente" title="Invitar gente">
          <Icon name="link" />
        </button>
      </div>
      <div className="side-list">
        {tree.loose.map(row)}
        {tree.groups.map(({ cat, items: list }) => {
          const isCollapsed = !!collapsed[cat.id];
          return (
            <div key={cat.id}>
              <div className="cat">
                <button className="cat-btn" aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !isCollapsed }))}>
                  <Icon name="chevron" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.name}</span>
                </button>
                {owner && (
                  <>
                    <button className="icon-btn" onClick={() => dialogs.channelEdit({ server_id: server.id, kind: "text", name: "", parent_id: cat.id, position: list.length })} aria-label={`Crear canal en ${cat.name}`} title="Crear canal">
                      <Icon name="plus" />
                    </button>
                    <button className="icon-btn" onClick={() => dialogs.channelEdit({ ...cat, server_id: server.id, kind: "category" })} aria-label={`Editar categoría ${cat.name}`} title="Editar categoría">
                      <Icon name="gear" />
                    </button>
                  </>
                )}
              </div>
              {list.filter((c) => !isCollapsed || place.channelId === c.id || unread[c.id]?.unread).map(row)}
            </div>
          );
        })}
        {!tree.flat.length && <div className="side-empty">Este servidor no tiene canales todavía.</div>}
      </div>
      <MePanel dialogs={dialogs} />
      {menu && <Menu at={menu} items={items} onClose={() => setMenu(null)} label={`Opciones de ${server.name}`} />}
    </aside>
  );
}

export function DmSidebar({ dialogs, onNavigate }: { dialogs: NavDialogs; onNavigate: () => void }) {
  const channels = useStore((s) => s.channels);
  const peers = useStore((s) => s.dmPeers);
  const profiles = useStore((s) => s.profiles);
  const unread = useStore((s) => s.unread);
  const place = useStore((s) => s.place);
  const dms = useMemo(
    () =>
      Object.values(channels)
        .filter((c) => c.kind === "dm")
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
    [channels],
  );
  return (
    <aside className="side" aria-label="Mensajes directos">
      <div className="side-head">
        <span className="name">Mensajes directos</span>
        <button className="icon-btn" onClick={dialogs.newDm} aria-label="Nuevo mensaje directo" title="Nuevo mensaje directo">
          <Icon name="plus" />
        </button>
      </div>
      <div className="side-list">
        {dms.map((c) => {
          const peer = profiles[peers[c.id]];
          const active = place.channelId === c.id;
          const u = unread[c.id];
          return (
            <div key={c.id} className={`chan${active ? " active" : ""}${u?.unread && !active ? " unread" : ""}`} style={{ height: 44 }}>
              <Avatar p={peer} size="sm" />
              <button
                className="label"
                onClick={() => {
                  go({ kind: "dm", channelId: c.id });
                  onNavigate();
                }}
              >
                {peer?.display_name ?? "…"}
              </button>
              {u && u.mentions > 0 && !active && <span className="badge">{u.mentions}</span>}
            </div>
          );
        })}
        {!dms.length && <div className="side-empty">Todavía no tenés charlas privadas. Tocá + y buscá a alguien por su @usuario.</div>}
      </div>
      <MePanel dialogs={dialogs} />
    </aside>
  );
}
