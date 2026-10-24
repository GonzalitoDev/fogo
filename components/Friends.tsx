"use client";

import { useMemo, useState } from "react";
import { friendlyError } from "@/lib/chat";
import {
  acceptFriend,
  blockUser,
  fail,
  openDm,
  pendingIncoming,
  presenceOf,
  removeFriend,
  sendFriendRequest,
  setState,
  toast,
  unblockUser,
  useStore,
} from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, Menu, STATUS_LABEL, type MenuItem } from "./ui";

type Tab = "online" | "all" | "pending" | "blocked" | "add";

export function FriendsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M13 10a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-7 1.7-7 4v2h14v-2c0-2.3-3.7-4-7-4ZM5.5 8.5a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5ZM4.2 10.5C2.3 10.8 1 11.8 1 13v2h3v-1c0-1.3.6-2.5 1.6-3.4a7 7 0 0 0-1.4-.1Z" />
    </svg>
  );
}

export function FriendsPage({ onMenu }: { onMenu: () => void }) {
  const st = useStore((s) => s);
  const [tab, setTab] = useState<Tab>("online");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ p: Profile; at: { x: number; y: number } } | null>(null);
  const pending = pendingIncoming(st);

  const rows = useMemo(() => {
    const all = Object.entries(st.relations)
      .map(([id, r]) => ({ p: st.profiles[id], r }))
      .filter((x): x is { p: Profile; r: (typeof st.relations)[string] } => !!x.p);
    let list: { p: Profile; r?: (typeof st.relations)[string] }[] = [];
    if (tab === "online") list = all.filter((x) => x.r.status === "friend" && presenceOf(st, x.p.id) !== "offline");
    if (tab === "all") list = all.filter((x) => x.r.status === "friend");
    if (tab === "pending") list = all.filter((x) => x.r.status !== "friend");
    if (tab === "blocked") list = Object.keys(st.blocked).map((id) => ({ p: st.profiles[id] })).filter((x) => !!x.p);
    const n = q.trim().toLowerCase();
    if (n) list = list.filter((x) => x.p.display_name.toLowerCase().includes(n) || x.p.username.includes(n));
    return list.sort((a, b) => a.p.display_name.localeCompare(b.p.display_name));
  }, [st, tab, q]);

  const title = { online: "En línea", all: "Todos los amigos", pending: "Pendiente", blocked: "Bloqueados", add: "" }[tab];

  const menuItems = (p: Profile): MenuItem[] => [
    { label: "Ver perfil", onClick: () => setState({ fullProfile: p.id }) },
    { label: "Mensaje", onClick: () => void openDm(p.id).catch(fail) },
    "sep",
    { label: "Eliminar amigo", danger: true, onClick: () => removeFriend(p.id).then(() => toast(`Eliminaste a ${p.display_name} de tus amigos`), fail) },
    { label: "Bloquear", danger: true, onClick: () => blockUser(p.id).then(() => toast(`Bloqueaste a ${p.display_name}`), fail) },
  ];

  return (
    <section className="chat friends-page">
      <header className="chat-head friends-head">
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Abrir navegación">
          <Icon name="menu" />
        </button>
        <span className="friends-title">
          <FriendsIcon /> Amigos
        </span>
        <span className="head-divider" />
        <nav className="friends-tabs" role="tablist" aria-label="Amigos">
          {(
            [
              ["online", "En línea"],
              ["all", "Todos"],
              ["pending", "Pendiente"],
              ["blocked", "Bloqueado"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>
              {l}
              {v === "pending" && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
          <button role="tab" aria-selected={tab === "add"} className={"add-friend" + (tab === "add" ? " on" : "")} onClick={() => setTab("add")}>
            Añadir amigo
          </button>
        </nav>
      </header>
      <div className="friends-body">
        <div className="friends-main">
          {tab === "add" ? (
            <AddFriend />
          ) : (
            <>
              <label className="friends-search">
                <input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar amigos" />
                <Icon name="search" />
              </label>
              <h3 className="friends-count">
                {title} — {rows.length}
              </h3>
              {!rows.length ? (
                <div className="friends-empty">
                  <div className="friends-empty-art" aria-hidden="true">
                    <FriendsIcon />
                  </div>
                  <p>
                    {tab === "online"
                      ? "No hay nadie por aquí. ¿Por qué no agregás a alguien?"
                      : tab === "pending"
                        ? "No hay solicitudes de amistad pendientes."
                        : tab === "blocked"
                          ? "No bloqueaste a nadie."
                          : "Todavía no tenés amigos. Agregá a alguien con su @usuario."}
                  </p>
                  {(tab === "online" || tab === "all") && (
                    <button className="btn primary" onClick={() => setTab("add")}>
                      Añadir amigo
                    </button>
                  )}
                </div>
              ) : (
                <div className="friend-list">
                  {rows.map(({ p, r }) => {
                    const pres = presenceOf(st, p.id);
                    return (
                      <div key={p.id} className="friend-row" onClick={() => r?.status === "friend" && void openDm(p.id).catch(fail)} role="button" tabIndex={0}>
                        <Avatar p={p} size="sm" status={tab === "blocked" ? undefined : pres} />
                        <div className="friend-text">
                          <b>
                            {p.display_name} <span className="friend-user">{p.username}</span>
                          </b>
                          <span>
                            {tab === "blocked"
                              ? "Bloqueado"
                              : r?.status === "incoming"
                                ? "Solicitud de amistad entrante"
                                : r?.status === "outgoing"
                                  ? "Solicitud de amistad saliente"
                                  : p.custom_status || STATUS_LABEL[pres]}
                          </span>
                        </div>
                        <div className="friend-actions" onClick={(e) => e.stopPropagation()}>
                          {tab === "blocked" ? (
                            <button className="round-btn" title="Desbloquear" aria-label={`Desbloquear a ${p.display_name}`} onClick={() => unblockUser(p.id).then(() => toast(`Desbloqueaste a ${p.display_name}`), fail)}>
                              <Icon name="close" />
                            </button>
                          ) : r?.status === "incoming" ? (
                            <>
                              <button className="round-btn ok" title="Aceptar" aria-label={`Aceptar a ${p.display_name}`} onClick={() => acceptFriend(p.id).then(() => toast(`Ahora sos amigo de ${p.display_name}`), fail)}>
                                <Icon name="check" />
                              </button>
                              <button className="round-btn no" title="Ignorar" aria-label={`Rechazar a ${p.display_name}`} onClick={() => removeFriend(p.id).catch(fail)}>
                                <Icon name="close" />
                              </button>
                            </>
                          ) : r?.status === "outgoing" ? (
                            <button className="round-btn no" title="Cancelar" aria-label={`Cancelar solicitud a ${p.display_name}`} onClick={() => removeFriend(p.id).catch(fail)}>
                              <Icon name="close" />
                            </button>
                          ) : (
                            <>
                              <button className="round-btn" title="Mensaje" aria-label={`Mensaje a ${p.display_name}`} onClick={() => void openDm(p.id).catch(fail)}>
                                <Icon name="chat" />
                              </button>
                              <button
                                className="round-btn"
                                title="Más"
                                aria-label={`Más opciones para ${p.display_name}`}
                                onClick={(e) => {
                                  const rc = e.currentTarget.getBoundingClientRect();
                                  setMenu({ p, at: { x: rc.left, y: rc.bottom + 4 } });
                                }}
                              >
                                <Icon name="dots" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <ActiveNow />
      </div>
      {menu && <Menu at={menu.at} label={menu.p.display_name} onClose={() => setMenu(null)} items={menuItems(menu.p)} />}
    </section>
  );
}

function AddFriend() {
  const [v, setV] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useStore((s) => s.me);
  return (
    <div className="add-friend-box">
      <h2>Añadir amigo</h2>
      <p className="hint">Podés agregar amigos con su nombre de usuario de Fogón. El tuyo es @{me?.username}.</p>
      <form
        className={"add-friend-form" + (msg ? (msg.ok ? " ok" : " bad") : "")}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await sendFriendRequest(v);
            const name = v.trim().replace(/^@/, "");
            setMsg({ ok: true, text: r === "aceptada" ? `¡Ahora sos amigo de @${name}!` : r === "ya" ? `Ya tenés una solicitud o amistad con @${name}.` : `¡Listo! Tu solicitud de amistad a @${name} fue enviada.` });
            setV("");
          } catch (err) {
            setMsg({ ok: false, text: friendlyError(err) });
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          autoFocus
          placeholder="Podés agregar amigos con su nombre de usuario."
          value={v}
          maxLength={33}
          onChange={(e) => {
            setV(e.target.value);
            setMsg(null);
          }}
          aria-label="Nombre de usuario"
        />
        <button className="btn primary" disabled={busy || !v.trim()}>
          Enviar solicitud de amistad
        </button>
      </form>
      {msg && <p className={msg.ok ? "add-ok" : "add-bad"}>{msg.text}</p>}
    </div>
  );
}

function ActiveNow() {
  const st = useStore((s) => s);
  const active = Object.entries(st.relations)
    .filter(([id, r]) => r.status === "friend" && presenceOf(st, id) !== "offline")
    .map(([id]) => st.profiles[id])
    .filter((p): p is Profile => !!p);
  return (
    <aside className="active-now" aria-label="Activo ahora">
      <h2>Activo ahora</h2>
      {active.length ? (
        active.map((p) => (
          <button key={p.id} className="active-card" onClick={() => setState({ fullProfile: p.id })}>
            <Avatar p={p} size="sm" status={presenceOf(st, p.id)} />
            <span>
              <b>{p.display_name}</b>
              <small>{p.custom_status || STATUS_LABEL[presenceOf(st, p.id)]}</small>
            </span>
          </button>
        ))
      ) : (
        <div className="active-empty">
          <b>Por ahora está tranquilo...</b>
          <p>Cuando un amigo esté conectado, lo vas a ver acá.</p>
        </div>
      )}
    </aside>
  );
}
