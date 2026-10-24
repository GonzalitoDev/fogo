"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BADGES, GRANTABLE } from "@/lib/badges";
import {
  fail,
  getState,
  mediaUrl,
  openDm,
  presenceOf,
  rolesOf,
  sendMessage,
  setBadge,
  setState,
  useStore,
  type State,
} from "@/lib/store";
import type { Presence, Profile } from "@/lib/types";
import { BadgeIcon, useBadges } from "./Badges";
import { Name } from "./Name";
import { BotTag } from "./Permissions";
import { Ember, Icon } from "./Icon";
import { Avatar, Modal, STATUS_LABEL, useEscape } from "./ui";

export type CardAction = { label: string; onClick: () => void; primary?: boolean; danger?: boolean };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Links clickeables en el "sobre mí". */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((x, i) =>
        /^https?:\/\//.test(x) ? (
          <a key={i} href={x} target="_blank" rel="noreferrer noopener">
            {x}
          </a>
        ) : (
          <span key={i}>{x}</span>
        ),
      )}
    </>
  );
}

/** Estilo del perfil: colores de tema (como Nitro) o el color del avatar. */
export function profileStyle(p: Profile): React.CSSProperties {
  const themed = !!(p.theme_top && p.theme_bottom);
  return {
    ["--c" as string]: p.color,
    ["--t1" as string]: p.theme_top ?? undefined,
    ["--t2" as string]: p.theme_bottom ?? undefined,
    ["--bn" as string]: p.banner_color ?? (themed ? p.theme_top! : p.color),
  };
}

/* ---------- la vista del perfil (popout, completo y vista previa usan la misma) ---------- */

export function ProfileView({
  p,
  variant,
  serverId,
  presence,
  children,
  tab,
  local,
}: {
  p: Profile;
  variant: "popout" | "full" | "preview";
  serverId?: string;
  presence?: Presence;
  children?: React.ReactNode;
  tab?: React.ReactNode;
  local?: { avatar?: string | null; banner?: string | null };
}) {
  const badges = useBadges(p);
  const banner = local && local.banner !== undefined ? local.banner : mediaUrl(p.banner_path);
  const themed = !!(p.theme_top && p.theme_bottom);
  const st = useStore((s) => s);
  const pres = presence ?? presenceOf(st, p.id);
  const roles = serverId ? rolesOf(st, serverId, p.id) : [];
  const joined = serverId ? st.joined[serverId]?.[p.id] : undefined;
  const server = serverId ? st.servers[serverId] : undefined;

  return (
    <div className={`pv pv-${variant}${themed ? " themed" : ""}`} style={profileStyle(p)}>
      {p.premium && p.profile_effect && <div className={`pv-effect fx-${p.profile_effect}`} aria-hidden="true" />}
      <div className={"pv-banner" + (banner ? " img" : "")}>{banner && <img src={banner} alt="" />}</div>
      <div className="pv-top">
        <span className="pv-avatar">
          <Avatar p={p} size="xl" status={pres} src={local?.avatar} />
        </span>
        {p.custom_status && <span className="pv-bubble">{p.custom_status}</span>}
        {badges.length > 0 && (
          <div className="pv-badges" aria-label="Insignias">
            {badges.map((b) => (
              <span key={b} className="pv-badge" tabIndex={0}>
                <BadgeIcon id={b} size={variant === "full" ? 20 : 18} />
                <span className="tip" role="tooltip">
                  <b>{BADGES[b].label}</b>
                  {BADGES[b].desc}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="pv-inner">
        <div className="pv-names">
          <h2>
            <Name p={p} /> {p.is_bot && <BotTag />}
          </h2>
          <div className="pv-handle">
            <span>{p.username}</span>
            {p.pronouns && (
              <>
                <span className="dot">•</span>
                <span>{p.pronouns}</span>
              </>
            )}
          </div>
          <span className={`pv-presence s-${pres}`}>
            <i /> {STATUS_LABEL[pres]}
          </span>
        </div>
        {tab}
        {(!tab || variant !== "full") && (
          <div className="pv-sections">
            {p.bio && (
              <section>
                <h3>Sobre mí</h3>
                <p className="pv-bio">
                  <Linkified text={p.bio} />
                </p>
              </section>
            )}
            <section>
              <h3>Miembro desde</h3>
              <div className="pv-since">
                <span title="En Fogón">
                  <span className="pv-since-ico fogon">
                    <Ember />
                  </span>
                  {fmtDate(p.created_at) || "hace poco"}
                </span>
                {joined && server && (
                  <>
                    <span className="pv-since-sep" />
                    <span title={`En ${server.name}`}>
                      <span className="pv-since-ico">{server.name.slice(0, 1).toUpperCase()}</span>
                      {fmtDate(joined)}
                    </span>
                  </>
                )}
              </div>
            </section>
            {roles.length > 0 && (
              <section>
                <h3>{roles.length === 1 ? "Rol" : "Roles"}</h3>
                <div className="pv-roles">
                  {roles.map((r) => (
                    <span key={r.id} className="pv-role" style={{ ["--rc" as string]: r.color || "var(--ink-3)" }}>
                      {r.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {variant !== "preview" && st.isAdmin && <AdminBadges p={p} />}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function AdminBadges({ p }: { p: Profile }) {
  const raw = useStore((s) => s.badges[p.id]);
  const granted = raw ?? [];
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h3>
        Insignias (admin)
        <button className="link-btn" onClick={() => setOpen(!open)}>
          {open ? "Listo" : "Editar"}
        </button>
      </h3>
      {open && (
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
  );
}

/* ---------- mandar un mensaje directo desde el perfil ---------- */

function QuickDm({ p, onSent }: { p: Profile; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="pv-dm"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        setBusy(true);
        try {
          const ch = await openDm(p.id);
          if (t) void sendMessage(ch, t, [], null);
          onSent();
        } catch (err) {
          fail(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input" placeholder={`Mandale un mensaje a @${p.username}`} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label={`Mensaje para ${p.display_name}`} />
    </form>
  );
}

/* ---------- popout (al tocar un nombre) ---------- */

export function ProfilePopout({ p, at, serverId, actions = [], onClose }: { p: Profile; at: { x: number; y: number }; serverId?: string; actions?: CardAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y, ready: false });
  const live = useStore((s) => s.profiles[p.id] ?? p);
  const meId = useStore((s) => s.me?.id);
  const isMe = live.id === meId;
  useEscape(onClose);
  useLayoutEffect(() => {
    const el = ref.current!;
    const place = () => {
      if (window.innerWidth < 700) return setPos({ left: 0, top: 0, ready: true });
      const left = Math.min(Math.max(8, at.x + 14), window.innerWidth - el.offsetWidth - 8);
      const top = Math.min(Math.max(8, at.y - 60), window.innerHeight - el.offsetHeight - 8);
      setPos({ left: Math.max(8, left), top: Math.max(8, top), ready: true });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [at.x, at.y]);
  return (
    <>
      <div className="backdrop pv-backdrop" onPointerDown={onClose} />
      <div ref={ref} className="pv-pop" role="dialog" aria-label={`Perfil de ${live.display_name}`} style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}>
        <ProfileView p={live} variant="popout" serverId={serverId}>
          <div className="pv-foot">
            {isMe ? (
              <button
                className="btn primary"
                onClick={() => {
                  onClose();
                  setState({ settings: { kind: "user", section: "profiles" } });
                }}
              >
                <Icon name="edit" /> Editar perfil
              </button>
            ) : (
              <QuickDm p={live} onSent={onClose} />
            )}
            <div className="pv-links">
              <button
                className="link-btn"
                onClick={() => {
                  onClose();
                  setState({ fullProfile: live.id });
                }}
              >
                Ver perfil completo
              </button>
              {actions.map((a) => (
                <button
                  key={a.label}
                  className={"link-btn" + (a.danger ? " danger" : "")}
                  onClick={() => {
                    onClose();
                    a.onClick();
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </ProfileView>
      </div>
    </>
  );
}

/* ---------- perfil completo (modal grande con pestañas) ---------- */

function commonServers(s: State, userId: string) {
  return Object.values(s.servers).filter((sv) => (s.members[sv.id] ?? []).includes(userId));
}

export function FullProfile() {
  const id = useStore((s) => s.fullProfile);
  const p = useStore((s) => (id ? s.profiles[id] : undefined));
  const st = useStore((s) => s);
  const [tab, setTab] = useState<"about" | "servers">("about");
  useEffect(() => setTab("about"), [id]);
  const servers = useMemo(() => (id ? commonServers(st, id) : []), [st, id]);
  if (!id || !p) return null;
  const close = () => setState({ fullProfile: null });
  const isMe = p.id === st.me?.id;
  return (
    <Modal label={`Perfil de ${p.display_name}`} onClose={close} wide>
      <div className="pv-full-wrap">
        <ProfileView
          p={p}
          variant="full"
          tab={
            <>
              <div className="pv-full-actions">
                {isMe ? (
                  <button
                    className="btn primary"
                    onClick={() => {
                      close();
                      setState({ settings: { kind: "user", section: "profiles" } });
                    }}
                  >
                    <Icon name="edit" /> Editar perfil
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    onClick={() => {
                      close();
                      void openDm(p.id).catch(fail);
                    }}
                  >
                    <Icon name="chat" /> Mensaje
                  </button>
                )}
              </div>
              <div className="pv-tabs" role="tablist">
                <button role="tab" aria-selected={tab === "about"} onClick={() => setTab("about")}>
                  Sobre mí
                </button>
                {!isMe && (
                  <button role="tab" aria-selected={tab === "servers"} onClick={() => setTab("servers")}>
                    Servidores en común — {servers.length}
                  </button>
                )}
              </div>
              {tab === "servers" ? (
                <div className="pv-common">
                  {servers.length ? (
                    servers.map((sv) => (
                      <button
                        key={sv.id}
                        className="pv-common-item"
                        onClick={() => {
                          close();
                          const first = Object.values(getState().channels).find((c) => c.server_id === sv.id && c.kind === "text");
                          location.hash = `#/s/${sv.id}${first ? `/${first.id}` : ""}`;
                        }}
                      >
                        <span className="pv-since-ico">{sv.name.slice(0, 1).toUpperCase()}</span>
                        {sv.name}
                      </button>
                    ))
                  ) : (
                    <p className="hint">No tienen servidores en común.</p>
                  )}
                </div>
              ) : (
                <FullAbout p={p} />
              )}
            </>
          }
        />
        <button className="icon-btn pv-close" onClick={close} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </div>
    </Modal>
  );
}

function FullAbout({ p }: { p: Profile }) {
  const isAdmin = useStore((s) => s.isAdmin);
  return (
    <div className="pv-sections">
      <section>
        <h3>Sobre mí</h3>
        <p className="pv-bio">{p.bio ? <Linkified text={p.bio} /> : <span className="hint">Todavía no escribió nada.</span>}</p>
      </section>
      <section>
        <h3>Miembro de Fogón desde</h3>
        <p>{fmtDate(p.created_at) || "hace poco"}</p>
      </section>
      {isAdmin && <AdminBadges p={p} />}
    </div>
  );
}
