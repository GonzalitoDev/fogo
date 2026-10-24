"use client";

import { useMemo, useState } from "react";
import { channelTree } from "@/lib/chat";
import { can, channelAllows, dmUnread, go, pendingIncoming, presenceOf, serverUnread, setSounds, setState, setStatus, useStore, type State } from "@/lib/store";
import type { Status } from "@/lib/types";
import type { Channel, Server } from "@/lib/types";
import { Ember, Icon } from "./Icon";
import { FriendsIcon } from "./Friends";
import { Avatar, Menu, STATUS_LABEL, type MenuItem } from "./ui";
import { MicButton, VoiceConnected, VoiceRow } from "./Voice";
import { joinVoice } from "@/lib/voice";
import { BotTag } from "./Permissions";
import { BoostGem } from "./Boost";
import { boostLevel } from "@/lib/boost";

export type NavDialogs = {
  createServer: () => void;
  invite: (s: Server) => void;
  serverSettings: (s: Server) => void;
  channelEdit: (c: Partial<Channel> & { server_id: string; kind: "text" | "category" | "voice" }) => void;
  confirmLeave: (s: Server) => void;
  roles: (s: Server) => void;
  bans: (s: Server) => void;
  boost: (s: Server) => void;
  newDm: () => void;
  profile: () => void;
  switcher: () => void;
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
  const dmCount = dmUnread(state) + pendingIncoming(state);
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
              className={`rail-btn${boostLevel(s.boost_count) >= 2 ? " boosted" : ""}`}
              onClick={() => {
                go({ kind: "server", serverId: s.id, channelId: null });
              }}
              aria-label={`${s.name}${u.mentions ? `, ${u.mentions} menciones` : u.unread ? ", mensajes sin leer" : ""}`}
              title={s.name}
            >
              {s.icon_url ? <img className="rail-icon" src={s.icon_url} alt="" draggable={false} /> : initialsOf(s.name)}
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

const STATUS_HINT: Record<Status, string> = {
  online: "",
  idle: "",
  dnd: "No te llegan avisos",
  invisible: "Aparecés desconectado, pero podés usar todo",
};

function MePanel({ dialogs }: { dialogs: NavDialogs }) {
  const me = useStore((s) => s.me);
  const st = useStore((s) => s);
  const sounds = useStore((s) => s.sounds);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const pres = me ? presenceOf(st, me.id) : "offline";
  const statuses: Status[] = ["online", "idle", "dnd", "invisible"];
  return (
    <>
    <VoiceConnected />
    <div className="me-panel">
      <button
        className="me-who"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.top - 8 });
        }}
        aria-label="Tu estado y perfil"
        title="Tu estado y perfil"
      >
        <Avatar p={me} size="sm" status={pres} />
        <span className="who">
          <b>{me?.display_name}</b>
          <span>{me?.custom_status || STATUS_LABEL[pres]}</span>
        </span>
      </button>
      <MicButton />
      <button
        className={`icon-btn${sounds ? "" : " off"}`}
        onClick={() => setSounds(!sounds)}
        aria-pressed={!sounds}
        aria-label={sounds ? "Ensordecer" : "Dejar de ensordecer"}
        title={sounds ? "Ensordecer (sin voz, sonidos ni avisos)" : "Dejar de ensordecer"}
      >
        <Icon name={sounds ? "headphones" : "headphonesOff"} />
      </button>
      <button className="icon-btn" onClick={dialogs.profile} aria-label="Ajustes de usuario" title="Ajustes de usuario">
        <Icon name="gear" />
      </button>
      {menu && me && (
        <Menu
          at={{ x: menu.x, y: Math.max(8, menu.y - 260) }}
          label="Tu estado"
          onClose={() => setMenu(null)}
          items={[
            ...statuses.map((x) => ({
              label: (x === "invisible" ? "Invisible" : STATUS_LABEL[x]) + ((me.status ?? "online") === x ? " ✓" : "") + (STATUS_HINT[x] ? ` · ${STATUS_HINT[x]}` : ""),
              icon: <span className={`status-dot inline s-${x === "invisible" ? "offline" : x}`} />,
              onClick: () => void setStatus(x),
            })),
            "sep" as const,
            { label: "Ver mi perfil", icon: <Icon name="users" />, onClick: () => setState({ fullProfile: me.id }) },
            { label: "Editar perfil", icon: <Icon name="edit" />, onClick: dialogs.profile },
          ]}
        />
      )}
    </div>
    </>
  );
}

function ChannelRow({ c, active, owner, onEdit, onPick, unread }: { c: Channel; active: boolean; owner: boolean; onEdit: () => void; onPick: () => void; unread: State["unread"][string] | undefined }) {
  const priv = useStore((s) => [c.parent_id, c.id].some((id) => id && (s.overrides[id] ?? []).some((o) => !o.role_id && o.deny.includes("view_channel"))));
  const readOnly = useStore((s) => !channelAllows(s, c.id, "send_messages"));
  return (
    <div className={`chan${active ? " active" : ""}${unread?.unread && !active ? " unread" : ""}`} title={readOnly ? "Solo lectura" : undefined}>
      <span className="hash-wrap">
        <Icon name="hash" className="hash" />
        {priv && <Icon name="lock" className="hash-lock" />}
      </span>
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
  const state = useStore((s) => s);
  const isOwner = me?.id === server.owner_id;
  const owner = can(state, server.id, "manage_channels");
  const level = boostLevel(server.boost_count);
  const canRoles = can(state, server.id, "manage_roles");
  const canServer = can(state, server.id, "manage_server");
  const tree = useMemo(() => channelTree(Object.values(channels), server.id), [channels, server.id]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const pick = (c: Channel) => {
    go({ kind: "server", serverId: server.id, channelId: c.id });
    onNavigate();
  };
  const row = (c: Channel) =>
    c.kind === "voice" ? (
      <VoiceRow
        key={c.id}
        c={c}
        active={place.channelId === c.id}
        owner={owner}
        onPick={() => {
          pick(c);
          void joinVoice(c.id);
        }}
        onEdit={() => dialogs.channelEdit({ ...c, server_id: server.id, kind: "voice" })}
      />
    ) : (
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
    { label: "Invitar gente", icon: <Icon name="link" />, accent: true, onClick: () => dialogs.invite(server) },
    { label: "Boostear servidor", icon: <BoostGem />, onClick: () => dialogs.boost(server) },
    ...(canServer || canRoles || can(state, server.id, "ban_members")
      ? ([{ label: "Ajustes del servidor", icon: <Icon name="gear" />, onClick: () => dialogs.serverSettings(server) }] as MenuItem[])
      : []),
    ...(owner
      ? ([
          { label: "Crear canal", icon: <Icon name="plusCircle" />, onClick: () => dialogs.channelEdit({ server_id: server.id, kind: "text", name: "", parent_id: tree.groups[0]?.cat.id ?? null }) },
          { label: "Crear categoría", icon: <Icon name="folder" />, onClick: () => dialogs.channelEdit({ server_id: server.id, kind: "category", name: "", position: tree.groups.length }) },
        ] as MenuItem[])
      : []),
    ...(canRoles ? ([{ label: "Roles", icon: <Icon name="shield" />, onClick: () => dialogs.roles(server) }] as MenuItem[]) : []),
    ...(can(state, server.id, "ban_members") ? ([{ label: "Baneos", icon: <Icon name="door" />, onClick: () => dialogs.bans(server) }] as MenuItem[]) : []),
    ...(!isOwner ? (["sep", { label: "Abandonar servidor", icon: <Icon name="door" />, danger: true, onClick: () => dialogs.confirmLeave(server) }] as MenuItem[]) : []),
  ];


  return (
    <aside className="side" aria-label={`Canales de ${server.name}`}>
      <div className={`side-head${level >= 1 ? " has-banner" : ""}`} style={level >= 1 ? { ["--bc" as string]: server.banner_color || "#ff73fa" } : undefined}>
        <button
          className="name"
          onClick={(e) => {
            const r = (e.currentTarget.closest(".side-head") as HTMLElement).getBoundingClientRect();
            setMenu(menu ? null : { x: r.left + 10, y: r.bottom + 8 });
          }}
          aria-haspopup="menu"
          aria-expanded={!!menu}
        >
          {level >= 1 && (
            <span className="srv-level" title={`Nivel ${level} de boosts · ${server.boost_count} boosts`}>
              <BoostGem />
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{server.name}</span>
          <Icon name={menu ? "close" : "chevron"} />
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
        {!tree.count && <div className="side-empty">Este servidor no tiene canales todavía.</div>}
      </div>
      <MePanel dialogs={dialogs} />
      {menu && <Menu at={menu} items={items} onClose={() => setMenu(null)} label={`Opciones de ${server.name}`} className="server-menu" />}
    </aside>
  );
}

export function DmSidebar({ dialogs, onNavigate }: { dialogs: NavDialogs; onNavigate: () => void }) {
  const channels = useStore((s) => s.channels);
  const peers = useStore((s) => s.dmPeers);
  const profiles = useStore((s) => s.profiles);
  const unread = useStore((s) => s.unread);
  const place = useStore((s) => s.place);
  const state = useStore((s) => s);
  const dms = useMemo(
    () =>
      Object.values(channels)
        .filter((c) => c.kind === "dm")
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
    [channels],
  );
  return (
    <aside className="side" aria-label="Mensajes directos">
      <div className="side-head dm-head">
        <button className="find-btn" onClick={dialogs.switcher} aria-label="Buscar o iniciar una conversación">
          Buscar o iniciar una conversación
        </button>
      </div>
      <div className="side-list">
        <div className={`chan dm-top${!place.channelId ? " active" : ""}`}>
          <span className="dm-top-ico">
            <FriendsIcon />
          </span>
          <button
            className="label"
            onClick={() => {
              go({ kind: "dm", channelId: null });
              onNavigate();
            }}
          >
            Amigos
          </button>
          {pendingIncoming(state) > 0 && <span className="badge">{pendingIncoming(state)}</span>}
        </div>
        <div className="cat dm-cat">
          <span className="cat-btn">Mensajes directos</span>
          <button className="icon-btn" onClick={dialogs.newDm} aria-label="Nuevo mensaje directo" title="Crear MD">
            <Icon name="plus" />
          </button>
        </div>
        {dms.map((c) => {
          const peer = profiles[peers[c.id]];
          const active = place.channelId === c.id;
          const u = unread[c.id];
          return (
            <div key={c.id} className={`chan${active ? " active" : ""}${u?.unread && !active ? " unread" : ""}`} style={{ height: 44 }}>
              <Avatar p={peer} size="sm" status={peer ? presenceOf(state, peer.id) : undefined} />
              <button
                className="label dm-label"
                onClick={() => {
                  go({ kind: "dm", channelId: c.id });
                  onNavigate();
                }}
              >
                <span className="dm-name">
                  {peer?.display_name ?? "…"} {peer?.is_official && <BotTag official />}
                </span>
                {!peer?.is_official && peer?.custom_status && <span className="dm-sub">{peer.custom_status}</span>}
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
