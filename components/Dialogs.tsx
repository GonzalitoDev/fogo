"use client";

import { useEffect, useState } from "react";
import { friendlyError, slugChannel } from "@/lib/chat";
import {
  createServer,
  deleteChannel,
  deleteServer,
  findUser,
  inviteInfo,
  joinServer,
  leaveServer,
  openDm,
  renameServer,
  resetInvite,
  saveChannel,
  can,
  toast,
  updateProfile,
  useStore,
} from "@/lib/store";
import type { Channel, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, COLORS, Confirm, Modal, copyText } from "./ui";

function Err({ text }: { text: string }) {
  return text ? (
    <div className="err" role="alert">
      {text}
    </div>
  ) : null;
}

function codeFrom(input: string): string {
  const t = input.trim();
  const m = /[?&]invite=([a-z0-9]+)/i.exec(t);
  return (m ? m[1] : t).toLowerCase();
}

export function CreateServerDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState(`El servidor de ${me?.display_name ?? "yo"}`);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal label="Crear o unirse a un servidor" onClose={onClose}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}>
          Crear
        </button>
        <button role="tab" aria-selected={tab === "join"} onClick={() => setTab("join")}>
          Unirme con invitación
        </button>
      </div>
      {tab === "create" ? (
        <form
          style={{ display: "grid", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(() => createServer(name.trim()));
          }}
        >
          <h2>Armá tu servidor</h2>
          <p>Es el lugar donde vos y tus amigos charlan. Arranca con un canal #general y después sumás los que quieras.</p>
          <label className="field">
            <span>Nombre del servidor</span>
            <input id="server-name" className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <Err text={err} />
          <div className="foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={busy || !name.trim()}>
              Crear servidor
            </button>
          </div>
        </form>
      ) : (
        <form
          style={{ display: "grid", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void run(() => joinServer(codeFrom(code)));
          }}
        >
          <h2>Unite a un servidor</h2>
          <label className="field">
            <span>Link o código de invitación</span>
            <input id="invite-code" className="input" autoFocus placeholder="https://…/?invite=3f9a1c0b2d" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <Err text={err} />
          <div className="foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={busy || !code.trim()}>
              Unirme
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function inviteLink(code: string) {
  return `${location.origin}${location.pathname}?invite=${code}`;
}

export function InviteDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const me = useStore((s) => s.me);
  const live = useStore((s) => s.servers[server.id]) ?? server;
  const canReset = useStore((s) => can(s, server.id, "manage_server"));
  const link = inviteLink(live.invite_code);
  const [copied, setCopied] = useState(false);
  return (
    <Modal label={`Invitar a ${live.name}`} onClose={onClose}>
      <h2>Invitá gente a {live.name}</h2>
      <p>Mandales este link. Quien lo abra y tenga cuenta en Fogón entra al servidor.</p>
      <div className="copy-row">
        <input id="invite-link" className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link de invitación" />
        <button
          className="btn primary"
          onClick={async () => {
            if (await copyText(link)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } else (document.getElementById("invite-link") as HTMLInputElement)?.select();
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {canReset && (
        <p className="hint">
          ¿Se filtró el link?{" "}
          <button
            style={{ border: 0, background: "none", padding: 0, color: "var(--accent)", fontWeight: 600 }}
            onClick={() => void resetInvite(live.id).then(() => toast("Link nuevo generado. El anterior ya no sirve."), (e) => toast(friendlyError(e), "error"))}
          >
            Generar uno nuevo
          </button>{" "}
          y el anterior deja de funcionar.
        </p>
      )}
      <div className="foot">
        <button className="btn" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}

export function InviteAcceptDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof inviteInfo>> | "loading" | "invalid">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    inviteInfo(code).then(
      (i) => setInfo(i ?? "invalid"),
      () => setInfo("invalid"),
    );
  }, [code]);
  return (
    <Modal label="Invitación" onClose={onClose}>
      {info === "loading" ? (
        <p>Buscando la invitación…</p>
      ) : info === "invalid" ? (
        <>
          <h2>La invitación no sirve</h2>
          <p>Puede que el link esté mal copiado o que el dueño lo haya cambiado. Pedile uno nuevo.</p>
          <div className="foot">
            <button className="btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Te invitaron a</p>
          <h2>{info.name}</h2>
          <p className="hint">
            {info.members} {Number(info.members) === 1 ? "miembro" : "miembros"}
          </p>
          <Err text={err} />
          <div className="foot">
            <button className="btn ghost" onClick={onClose}>
              Ahora no
            </button>
            <button
              className="btn primary"
              disabled={busy}
              autoFocus
              onClick={async () => {
                setBusy(true);
                try {
                  await joinServer(code);
                  onClose();
                } catch (e) {
                  setErr(friendlyError(e));
                  setBusy(false);
                }
              }}
            >
              {info.already_member ? "Ir al servidor" : "Unirme"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ServerSettingsDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const isOwner = useStore((s) => s.me?.id === server.owner_id);
  const [name, setName] = useState(server.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal label="Ajustes del servidor" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await renameServer(server.id, name);
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Ajustes del servidor</h2>
        <label className="field">
          <span>Nombre</span>
          <input id="server-rename" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Err text={err} />
        <div className="foot">
          {isOwner && (
            <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>
              Borrar servidor
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            Guardar
          </button>
        </div>
      </form>
      {confirm && (
        <Confirm
          title={`Borrar ${server.name}`}
          text="Se borran todos los canales y mensajes, para todos los miembros. No se puede deshacer."
          action="Borrar servidor"
          danger
          onConfirm={async () => {
            try {
              await deleteServer(server.id);
              onClose();
            } catch (e) {
              toast(friendlyError(e), "error");
            }
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </Modal>
  );
}

export function LeaveServerDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  return (
    <Confirm
      title={`Salir de ${server.name}`}
      text="Vas a dejar de ver sus canales. Para volver necesitás otra invitación."
      action="Salir"
      danger
      onConfirm={() => leaveServer(server.id).catch((e) => toast(friendlyError(e), "error"))}
      onClose={onClose}
    />
  );
}

export function ChannelDialog({ initial, onClose }: { initial: Partial<Channel> & { server_id: string; kind: "text" | "category" }; onClose: () => void }) {
  const channels = useStore((s) => s.channels);
  const cats = Object.values(channels).filter((c) => c.server_id === initial.server_id && c.kind === "category").sort((a, b) => a.position - b.position);
  const isCat = initial.kind === "category";
  const [name, setName] = useState(initial.name ?? "");
  const [topic, setTopic] = useState(initial.topic ?? "");
  const [parent, setParent] = useState(initial.parent_id ?? "");
  const [position, setPosition] = useState(initial.position ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const finalName = isCat ? name.trim() : slugChannel(name);
  const noun = isCat ? "categoría" : "canal";
  return (
    <Modal label={initial.id ? `Editar ${noun}` : `Crear ${noun}`} onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!finalName) return;
          setBusy(true);
          setErr("");
          try {
            await saveChannel({ ...initial, name: finalName, topic: isCat ? "" : topic, parent_id: isCat ? null : parent || null, position });
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>{initial.id ? `Editar ${isCat ? "categoría" : `#${initial.name}`}` : `Crear ${noun}`}</h2>
        <label className="field">
          <span>Nombre</span>
          <input id="channel-name" className="input" autoFocus maxLength={100} value={name} placeholder={isCat ? "Proyectos" : "nuevo-canal"} onChange={(e) => setName(e.target.value)} />
          {!isCat && name && finalName !== name && <span className="hint" style={{ fontWeight: 400 }}>Va a quedar como #{finalName || "…"}</span>}
        </label>
        {!isCat && (
          <>
            <label className="field">
              <span>Tema (opcional)</span>
              <input id="channel-topic" className="input" maxLength={1024} value={topic} placeholder="De qué se habla acá" onChange={(e) => setTopic(e.target.value)} />
            </label>
            <label className="field">
              <span>Categoría</span>
              <select id="channel-parent" className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Sin categoría</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="field">
          <span>Orden</span>
          <input id="channel-position" className="input" type="number" min={0} max={999} value={position} onChange={(e) => setPosition(Number(e.target.value) || 0)} />
          <span className="hint" style={{ fontWeight: 400 }}>
            Los números más chicos van arriba.
          </span>
        </label>
        <Err text={err} />
        <div className="foot">
          {initial.id && (
            <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>
              Borrar
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !finalName}>
            {initial.id ? "Guardar" : `Crear ${noun}`}
          </button>
        </div>
      </form>
      {confirm && initial.id && (
        <Confirm
          title={isCat ? `Borrar la categoría ${initial.name}` : `Borrar #${initial.name}`}
          text={isCat ? "Los canales que tenía quedan sin categoría; no se borran." : "Se borran todos sus mensajes para todos. No se puede deshacer."}
          action="Borrar"
          danger
          onConfirm={async () => {
            try {
              await deleteChannel(initial.id!);
              onClose();
            } catch (e) {
              toast(friendlyError(e), "error");
            }
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </Modal>
  );
}

export function NewDmDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const members = useStore((s) => s.members);
  const profiles = useStore((s) => s.profiles);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const known = [...new Set(Object.values(members).flat())]
    .filter((id) => id !== me?.id)
    .map((id) => profiles[id])
    .filter(Boolean)
    .filter((p) => !q || p.username.includes(q.toLowerCase().replace(/^@/, "")) || p.display_name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  const open = async (id: string) => {
    setBusy(true);
    try {
      await openDm(id);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  };
  return (
    <Modal label="Nuevo mensaje directo" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          const u = q.trim().toLowerCase().replace(/^@/, "");
          if (!u) return;
          setBusy(true);
          try {
            const p = await findUser(u);
            if (!p) {
              setErr(`No hay nadie con el usuario @${u}.`);
              setBusy(false);
              return;
            }
            if (p.id === me?.id) {
              setErr("Ese sos vos.");
              setBusy(false);
              return;
            }
            await open(p.id);
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>Nuevo mensaje directo</h2>
        <label className="field">
          <span>Usuario</span>
          <input id="dm-user" className="input" autoFocus placeholder="@usuario" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {known.length > 0 && (
          <div style={{ display: "grid", gap: 2 }}>
            <span className="hint">De tus servidores</span>
            {known.map((p) => (
              <button key={p.id} type="button" className="member" onClick={() => void open(p.id)} disabled={busy}>
                <Avatar p={p} size="sm" />
                <span className="nm">
                  <b>{p.display_name}</b> <span className="hint">@{p.username}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <Err text={err} />
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !q.trim()}>
            Abrir charla
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [name, setName] = useState(me.display_name);
  const [color, setColor] = useState(me.color);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notif, setNotif] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  return (
    <Modal label="Tu perfil" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await updateProfile(name, color);
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Avatar p={{ ...me, display_name: name || me.display_name, color }} />
          <div>
            <h2>{name || me.display_name}</h2>
            <span className="hint">@{me.username}</span>
          </div>
        </div>
        <label className="field">
          <span>Nombre visible</span>
          <input id="profile-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="colors" role="radiogroup" aria-label="Color del avatar">
            {COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} className="color" style={{ ["--c" as string]: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Avisos de menciones y mensajes directos</span>
          {notif === "granted" ? (
            <span className="hint" style={{ fontWeight: 400 }}>
              Activados en este navegador.
            </span>
          ) : notif === "denied" ? (
            <span className="hint" style={{ fontWeight: 400 }}>
              El navegador los bloqueó. Habilitalos desde la configuración del sitio.
            </span>
          ) : notif === "unsupported" ? (
            <span className="hint" style={{ fontWeight: 400 }}>
              Este navegador no tiene notificaciones.
            </span>
          ) : (
            <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={async () => setNotif(await Notification.requestPermission())}>
              <Icon name="at" /> Activar avisos
            </button>
          )}
        </div>
        <Err text={err} />
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
