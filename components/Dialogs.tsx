"use client";

import { useEffect, useState } from "react";
import { friendlyError, initials, slugChannel } from "@/lib/chat";
import {
  createServer,
  deleteChannel,
  deleteServer,
  findUser,
  inviteInfo,
  joinServer,
  myReferrals,
  leaveServer,
  loadMentions,
  markAllRead,
  openDm,
  openMention,
  renameServer,
  setServerPerks,
  resetInvite,
  setServerIcon,
  saveChannel,
  can,
  toast,
  updateProfile,
  useStore,
  getState,
  presenceOf,
  removeProfileMedia,
  uploadProfileMedia,
  type MentionRow,
  type ProfilePatch,
} from "@/lib/store";
import { ProfileView } from "./Profile";
import { ChannelPermissions } from "./Permissions";
import type { Channel, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { BoostGem } from "./Boost";
import { boostLevel } from "@/lib/boost";
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

export function inviteLink(code: string, ref?: string) {
  return `${location.origin}${location.pathname}?invite=${code}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
}

export function InviteDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const me = useStore((s) => s.me);
  const live = useStore((s) => s.servers[server.id]) ?? server;
  const canReset = useStore((s) => can(s, server.id, "manage_server"));
  const link = inviteLink(live.invite_code, me?.username);
  const [copied, setCopied] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void myReferrals().then(setCount);
  }, []);
  return (
    <Modal label={`Invitar a ${live.name}`} onClose={onClose}>
      <h2>Invitá gente a {live.name}</h2>
      <p>Mandales este link. Quien lo abra y tenga cuenta en Fogón entra al servidor.</p>
      {count !== null && (
        <p className="hint invite-ref">
          🏅 El link lleva tu nombre: {count === 0 ? "todavía no trajiste a nadie" : `ya trajiste a ${count} ${count === 1 ? "persona" : "personas"}`}.
          {count < 3 ? ` Con ${3 - count} más te ganás la insignia Embajador.` : " ¡Sos Embajador del Fogón!"}
        </p>
      )}
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
      <div className="foot inline-hide">
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

function ServerIconPicker({ server }: { server: Server }) {
  const live = useStore((s) => s.servers[server.id]) ?? server;
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        await setServerIcon(server.id, f);
        toast("Logo actualizado");
      } catch (e) {
        toast(friendlyError(e), "error");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  return (
    <div className="server-icon-pick">
      <span className="server-icon-prev" aria-hidden="true">
        {live.icon_url ? <img src={live.icon_url} alt="" /> : live.name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase()}
      </span>
      <div>
        <b>Logo del servidor</b>
        <p className="hint">Se ve en la barra de la izquierda. Una imagen cuadrada queda mejor (mínimo 128×128).</p>
        <div className="row-btns">
          <button type="button" className="btn primary" disabled={busy} onClick={pick}>
            {busy ? "Subiendo…" : "Subir logo"}
          </button>
          {live.icon_url && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void setServerIcon(server.id, null).catch((e) => toast(friendlyError(e), "error"))}>
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ServerSettingsDialog({ server: initial, onClose }: { server: Server; onClose: () => void }) {
  const server = useStore((s) => s.servers[initial.id]) ?? initial;
  const isOwner = useStore((s) => s.me?.id === server.owner_id);
  const level = boostLevel(server.boost_count);
  const [banner, setBanner] = useState(server.banner_color ?? "#ff73fa");
  const [vanity, setVanity] = useState(server.invite_vanity ? server.invite_code : "");
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
            if (isOwner && level >= 1 && banner !== (server.banner_color ?? "#ff73fa")) await setServerPerks(server.id, { banner });
            if (isOwner && level >= 3 && vanity.trim() && vanity.trim().toLowerCase() !== (server.invite_vanity ? server.invite_code : ""))
              await setServerPerks(server.id, { vanity: vanity.trim() });
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Ajustes del servidor</h2>
        <ServerIconPicker server={server} />
        <label className="field">
          <span>Nombre</span>
          <input id="server-rename" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {isOwner && (
          <div className="field boost-perks">
            <span>
              <BoostGem /> Mejoras por boosts · {level ? `Nivel ${level}` : "sin nivel"} ({server.boost_count ?? 0} boosts)
            </span>
            <label className="perk-row">
              <span>Color del banner</span>
              {level >= 1 ? (
                <input type="color" value={banner} onChange={(e) => setBanner(e.target.value)} aria-label="Color del banner" />
              ) : (
                <small>🔒 Nivel 1 (2 boosts)</small>
              )}
            </label>
            <label className="perk-row">
              <span>Link personalizado</span>
              {level >= 3 ? (
                <span className="vanity">
                  ?invite=
                  <input className="input" maxLength={20} placeholder="miserver" value={vanity} onChange={(e) => setVanity(e.target.value.replace(/[^a-z0-9]/gi, "").toLowerCase())} aria-label="Link personalizado" />
                </span>
              ) : (
                <small>🔒 Nivel 3 (14 boosts)</small>
              )}
            </label>
          </div>
        )}
        <Err text={err} />
        <div className="foot">
          {isOwner && (
            <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>
              Borrar servidor
            </button>
          )}
          <button type="button" className="btn ghost inline-hide" onClick={onClose}>
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

export function ChannelDialog({ initial, onClose }: { initial: Partial<Channel> & { server_id: string; kind: "text" | "category" | "voice" }; onClose: () => void }) {
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
  const [kind, setKind] = useState<"text" | "voice">(initial.kind === "voice" ? "voice" : "text");
  const isVoice = !isCat && kind === "voice";
  // los de voz se escriben como uno quiera (con mayúsculas y espacios), como en Discord
  const finalName = isCat || isVoice ? name.trim() : slugChannel(name);
  const noun = isCat ? "categoría" : "canal";
  const [tab, setTab] = useState<"general" | "perms">("general");
  const live = initial.id ? channels[initial.id] : undefined;
  return (
    <Modal label={initial.id ? `Editar ${noun}` : `Crear ${noun}`} onClose={onClose} wide={tab === "perms"}>
      {live && (
        <div className="chan-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "general"} onClick={() => setTab("general")}>
            Vista general
          </button>
          <button role="tab" aria-selected={tab === "perms"} onClick={() => setTab("perms")}>
            Permisos
          </button>
        </div>
      )}
      {tab === "perms" && live ? (
        <>
          <h2>Permisos de {isCat || live.kind === "voice" ? live.name : `#${live.name}`}</h2>
          <ChannelPermissions channel={live} />
          <div className="foot">
            <button type="button" className="btn primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </>
      ) : (
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!finalName) return;
          setBusy(true);
          setErr("");
          try {
            await saveChannel({ ...initial, kind: isCat ? "category" : kind, name: finalName, topic: isCat || isVoice ? "" : topic, parent_id: isCat ? null : parent || null, position });
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>{initial.id ? `Editar ${isCat ? "categoría" : initial.kind === "voice" ? initial.name : `#${initial.name}`}` : `Crear ${noun}`}</h2>
        {!isCat && !initial.id && (
          <div className="field" role="radiogroup" aria-label="Tipo de canal">
            <span>Tipo de canal</span>
            {(
              [
                ["text", "hash", "Texto", "Mandá mensajes, imágenes, GIF, emojis, opiniones y chistes"],
                ["voice", "speaker", "Voz", "Pasa el rato con voz"],
              ] as const
            ).map(([v, ico, label, help]) => (
              <label key={v} className={`kind-opt${kind === v ? " on" : ""}`}>
                <Icon name={ico} />
                <span>
                  <b>{label}</b>
                  <small>{help}</small>
                </span>
                <input type="radio" name="channel-kind" value={v} checked={kind === v} onChange={() => setKind(v)} />
              </label>
            ))}
          </div>
        )}
        <label className="field">
          <span>Nombre</span>
          <input id="channel-name" className="input" autoFocus maxLength={100} value={name} placeholder={isCat ? "Proyectos" : isVoice ? "Sala de estar" : "nuevo-canal"} onChange={(e) => setName(e.target.value)} />
          {!isCat && !isVoice && name && finalName !== name && <span className="hint" style={{ fontWeight: 400 }}>Va a quedar como #{finalName || "…"}</span>}
        </label>
        {!isCat && (
          <>
            {!isVoice && (
              <label className="field">
                <span>Tema (opcional)</span>
                <input id="channel-topic" className="input" maxLength={1024} value={topic} placeholder="De qué se habla acá" onChange={(e) => setTopic(e.target.value)} />
              </label>
            )}
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
      )}
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

const THEMES: [string, string][] = [
  ["#3b1d5c", "#c4569b"],
  ["#0f3b4c", "#2f9c95"],
  ["#4a1f0f", "#e07a3f"],
  ["#14213d", "#3f7fd1"],
  ["#2b2b2b", "#6b7b77"],
  ["#3d0e1b", "#d0504a"],
];

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const [d, setD] = useState({
    display_name: me.display_name,
    pronouns: me.pronouns ?? "",
    color: me.color,
    bio: me.bio ?? "",
    custom_status: me.custom_status ?? "",
    banner_color: me.banner_color ?? null,
    theme_top: me.theme_top ?? null,
    theme_bottom: me.theme_bottom ?? null,
  });
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  // fotos nuevas (todavía sin subir): File + URL local para la vista previa; null = quitar
  const [avatar, setAvatar] = useState<{ file: File; url: string } | null | undefined>(undefined);
  const [banner, setBanner] = useState<{ file: File; url: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notif, setNotif] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const themed = !!(d.theme_top && d.theme_bottom);

  const pick = (kind: "avatar" | "banner") => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/png,image/jpeg,image/webp,image/gif";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return setErr("La imagen pesa más de 8 MB.");
      const v = { file: f, url: URL.createObjectURL(f) };
      if (kind === "avatar") setAvatar(v);
      else setBanner(v);
    };
    inp.click();
  };

  const draft = { ...me, ...d };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const patch: ProfilePatch = { ...d, pronouns: d.pronouns.trim(), bio: d.bio.trim(), custom_status: d.custom_status.trim() };
      const old: (string | null | undefined)[] = [];
      if (avatar !== undefined) {
        patch.avatar_path = avatar ? await uploadProfileMedia("avatar", avatar.file) : null;
        old.push(me.avatar_path);
      }
      if (banner !== undefined) {
        patch.banner_path = banner ? await uploadProfileMedia("banner", banner.file) : null;
        old.push(me.banner_path);
      }
      await updateProfile(patch);
      old.forEach((x) => removeProfileMedia(x));
      toast("Perfil guardado");
      setAvatar(undefined);
      setBanner(undefined);
      setBusy(false);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal label="Editar perfil" onClose={onClose} wide>
      <div className="pe">
        <div className="pe-form">
          <h2>Perfil</h2>
          <label className="field">
            <span>Nombre visible</span>
            <input id="profile-name" className="input" maxLength={40} value={d.display_name} onChange={(e) => set({ display_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Pronombres</span>
            <input className="input" maxLength={40} placeholder="él/ella/elle" value={d.pronouns} onChange={(e) => set({ pronouns: e.target.value })} />
          </label>
          <div className="field">
            <span>Foto de perfil</span>
            <div className="pe-row">
              <button type="button" className="btn primary" onClick={() => pick("avatar")}>
                <Icon name="camera" /> Cambiar foto
              </button>
              {(avatar || (avatar === undefined && me.avatar_path)) && (
                <button type="button" className="btn ghost" onClick={() => setAvatar(null)}>
                  Quitar
                </button>
              )}
            </div>
            <div className="colors" role="radiogroup" aria-label="Color (cuando no hay foto)">
              {COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={c === d.color} aria-label={c} className="color" style={{ ["--c" as string]: c }} onClick={() => set({ color: c })} />
              ))}
            </div>
          </div>
          <div className="field">
            <span>Banner</span>
            <div className="pe-row">
              <button type="button" className="btn" onClick={() => pick("banner")}>
                <Icon name="image" /> Subir imagen
              </button>
              {(banner || (banner === undefined && me.banner_path)) && (
                <button type="button" className="btn ghost" onClick={() => setBanner(null)}>
                  Quitar
                </button>
              )}
              <label className="pe-color" title="Color del banner">
                <input type="color" value={d.banner_color ?? d.color} onChange={(e) => set({ banner_color: e.target.value })} aria-label="Color del banner" />
                Color
              </label>
            </div>
          </div>
          <div className="field">
            <span>Tema del perfil</span>
            <div className="pe-row">
              <button type="button" className={"pe-theme none" + (!themed ? " on" : "")} onClick={() => set({ theme_top: null, theme_bottom: null })} aria-label="Sin tema" title="Sin tema" />
              {THEMES.map(([a, b]) => (
                <button
                  type="button"
                  key={a}
                  className={"pe-theme" + (d.theme_top === a && d.theme_bottom === b ? " on" : "")}
                  style={{ background: `linear-gradient(${a}, ${b})` }}
                  onClick={() => set({ theme_top: a, theme_bottom: b })}
                  aria-label={`Tema ${a} a ${b}`}
                />
              ))}
              <label className="pe-color" title="Elegir colores">
                <input type="color" value={d.theme_top ?? "#3b1d5c"} onChange={(e) => set({ theme_top: e.target.value, theme_bottom: d.theme_bottom ?? "#c4569b" })} aria-label="Color de arriba" />
                <input type="color" value={d.theme_bottom ?? "#c4569b"} onChange={(e) => set({ theme_bottom: e.target.value, theme_top: d.theme_top ?? "#3b1d5c" })} aria-label="Color de abajo" />
              </label>
            </div>
          </div>
          <label className="field">
            <span>Estado personalizado</span>
            <input className="input" maxLength={128} placeholder="🔥 armando el fogón" value={d.custom_status} onChange={(e) => set({ custom_status: e.target.value })} />
          </label>
          <label className="field">
            <span>
              Sobre mí <small className="hint">{190 - d.bio.length}</small>
            </span>
            <textarea className="input" rows={4} maxLength={190} placeholder="Contá algo de vos. Los links se pueden tocar." value={d.bio} onChange={(e) => set({ bio: e.target.value })} />
          </label>
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
        </div>
        <div className="pe-preview">
          <h2>Vista previa</h2>
          <ProfileView
            p={draft}
            variant="preview"
            presence={presenceOf(getState(), me.id)}
            local={{ avatar: avatar === undefined ? undefined : avatar?.url ?? null, banner: banner === undefined ? undefined : banner?.url ?? null }}
          />
        </div>
      </div>
      <Err text={err} />
      <div className="foot">
        <button type="button" className="btn ghost inline-hide" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn primary" disabled={busy || !d.display_name.trim()} onClick={save}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}

export function MentionsDialog({ onClose }: { onClose: () => void }) {
  const servers = useStore((s) => s.servers);
  const [rows, setRows] = useState<MentionRow[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => loadMentions().then(setRows).catch((e) => setErr(friendlyError(e)));
  useEffect(() => {
    void load();
  }, []);
  const markAll = async () => {
    try {
      for (const id of Object.keys(servers)) await markAllRead(id);
      await markAllRead(null);
      toast("Listo, todo marcado como leído");
      await load();
    } catch (e) {
      setErr(friendlyError(e));
    }
  };
  return (
    <Modal label="Menciones" onClose={onClose} wide>
      <h2>Menciones</h2>
      <p className="hint">Donde te nombraron y los mensajes directos que todavía no leíste.</p>
      <Err text={err} />
      {!rows && <p className="hint">Cargando…</p>}
      {rows?.length === 0 && <p className="hint">No hay menciones ni mensajes directos sin leer.</p>}
      {!!rows?.length && (
        <div className="mention-list">
          {rows.map((r) => (
            <button
              key={r.id}
              className="mention-row"
              onClick={() => {
                onClose();
                openMention(r.channel_id, r.id);
              }}
            >
              <span className="mention-ava">{initials(r.author_name)}</span>
              <span className="mention-txt">
                <span className="mention-top">
                  <b>{r.author_name}</b>
                  <span className="mention-where">{r.channel_kind === "dm" ? "mensaje directo" : `#${r.channel_name}`}</span>
                  <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString("es-AR")}</time>
                </span>
                <span className="mention-body">{r.content || "…"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="foot">
        <button className="btn ghost" onClick={() => void markAll()}>
          Marcar todo como leído
        </button>
        <button className="btn primary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}