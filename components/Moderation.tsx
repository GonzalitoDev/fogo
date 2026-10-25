"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { banMember, listBans, loadAudit, setTimeoutFor, timeoutOf, toast, unban, useStore } from "@/lib/store";
import type { AuditEntry, Ban, Profile, Server } from "@/lib/types";
import { PERMS } from "@/lib/types";
import { Avatar, Modal } from "./ui";

const DELETE_OPTS: { v: 0 | 1 | 24 | 168; label: string }[] = [
  { v: 0, label: "No borrar nada" },
  { v: 1, label: "La última hora" },
  { v: 24, label: "Las últimas 24 horas" },
  { v: 168, label: "Los últimos 7 días" },
];

/** Banear: sale del servidor y no puede volver con ninguna invitación. */
export function BanDialog({ server, member, onClose }: { server: Server; member: Profile; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<0 | 1 | 24 | 168>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal label={`Banear a ${member.display_name}`} onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await banMember(server.id, member.id, reason, hours);
            toast(`${member.display_name} quedó baneado de ${server.name}`);
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <div className="ban-head">
          <Avatar p={member} size="lg" />
          <div>
            <h2>¿Banear a {member.display_name}?</h2>
            <p>Sale de {server.name} y no puede volver a entrar, ni siquiera con un link de invitación nuevo, hasta que lo desbaneen.</p>
          </div>
        </div>
        <label className="field">
          <span>Borrar sus mensajes de</span>
          <select className="input" value={hours} onChange={(e) => setHours(Number(e.target.value) as 0 | 1 | 24 | 168)}>
            {DELETE_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Motivo (lo ven solo quienes pueden banear)</span>
          <textarea className="input" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam, faltas de respeto…" />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn danger" disabled={busy}>
            {busy ? "Baneando…" : "Banear"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lista de baneados con la opción de desbanear. */
export function BansDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const [list, setList] = useState<Ban[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const profiles = useStore((s) => s.profiles);
  const load = () =>
    listBans(server.id).then(setList, (e) => {
      setErr(friendlyError(e));
      setList([]);
    });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);
  const shown = (list ?? []).filter((b) => {
    const p = b.profile;
    return !q || `${p?.display_name ?? ""} ${p?.username ?? ""}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <Modal label={`Baneos de ${server.name}`} onClose={onClose}>
      <h2>Baneos — {server.name}</h2>
      {(list?.length ?? 0) > 5 && <input className="input" placeholder="Buscar baneado" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar baneado" />}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {!list ? (
        <p className="hint">Cargando…</p>
      ) : !shown.length ? (
        <p className="hint">{list.length ? "Nadie coincide con la búsqueda." : "No hay nadie baneado. Para banear, tocá a alguien en la lista de miembros."}</p>
      ) : (
        <div className="ban-list">
          {shown.map((b) => {
            const by = b.banned_by ? profiles[b.banned_by] : null;
            return (
              <div key={b.user_id} className="ban-row">
                <Avatar p={b.profile} size="sm" />
                <div className="ban-text">
                  <b>{b.profile?.display_name ?? "Usuario"}</b>
                  <span className="hint">
                    @{b.profile?.username ?? "?"} · {new Date(b.created_at).toLocaleDateString("es-AR")}
                    {by ? ` · por ${by.display_name}` : ""}
                  </span>
                  {b.reason && <span className="ban-reason">«{b.reason}»</span>}
                </div>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    try {
                      await unban(server.id, b.user_id);
                      setList((l) => (l ?? []).filter((x) => x.user_id !== b.user_id));
                      toast(`Desbaneaste a ${b.profile?.display_name ?? "esa persona"}. Ya puede volver con una invitación.`);
                    } catch (e) {
                      toast(friendlyError(e), "error");
                    }
                  }}
                >
                  Desbanear
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="foot inline-hide">
        <button className="btn ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

/* ---------- aislar ---------- */

export const TIMEOUT_OPTS: { min: number; label: string }[] = [
  { min: 1, label: "60 segundos" },
  { min: 5, label: "5 minutos" },
  { min: 10, label: "10 minutos" },
  { min: 60, label: "1 hora" },
  { min: 1440, label: "1 día" },
  { min: 10080, label: "1 semana" },
];

export function untilText(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `hoy a las ${hm}` : `el ${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} a las ${hm}`;
}

/** Aislar (como el "timeout" de Discord): por un rato solo puede leer. */
export function TimeoutDialog({ server, member, onClose }: { server: Server; member: Profile; onClose: () => void }) {
  const [min, setMin] = useState(10);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal label={`Aislar a ${member.display_name}`} onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await setTimeoutFor(server.id, member.id, min, reason);
            toast(`${member.display_name} quedó aislado ${TIMEOUT_OPTS.find((o) => o.min === min)?.label ?? ""}`);
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <div className="ban-head">
          <Avatar p={member} size="lg" />
          <div>
            <h2>¿Aislar a {member.display_name}?</h2>
            <p>Mientras dure, puede leer pero no puede escribir, reaccionar, crear hilos ni hablar en voz en {server.name}.</p>
          </div>
        </div>
        <div className="field">
          <span>Duración</span>
          <div className="to-opts" role="radiogroup" aria-label="Duración">
            {TIMEOUT_OPTS.map((o) => (
              <button type="button" key={o.min} role="radio" aria-checked={min === o.min} className={"to-opt" + (min === o.min ? " on" : "")} onClick={() => setMin(o.min)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Motivo (opcional, queda en el registro de auditoría)</span>
          <textarea className="input" rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Spam, se pasó de rosca…" />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn danger" disabled={busy}>
            {busy ? "Aislando…" : "Aislar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cartelito en el composer cuando estás aislado. */
export function TimeoutNotice({ serverId }: { serverId: string }) {
  const t = useStore((s) => (s.me ? timeoutOf(s, serverId, s.me.id) : null));
  if (!t) return null;
  return (
    <div className="timeout-note" role="status">
      <span aria-hidden>⏳</span> Estás aislado hasta {untilText(t.until)}. Podés leer, pero no escribir ni reaccionar.
      {t.reason && <span className="hint"> Motivo: «{t.reason}»</span>}
    </div>
  );
}

/* ---------- registro de auditoría ---------- */

const ACTIONS: Record<string, { label: string; icon: string }> = {
  role_insert: { label: "creó el rol", icon: "🛡️" },
  role_update: { label: "cambió el rol", icon: "🛡️" },
  role_delete: { label: "borró el rol", icon: "🛡️" },
  member_role_add: { label: "le dio un rol a", icon: "➕" },
  member_role_remove: { label: "le sacó un rol a", icon: "➖" },
  channel_insert: { label: "creó el canal", icon: "#️⃣" },
  channel_update: { label: "cambió el canal", icon: "#️⃣" },
  channel_delete: { label: "borró el canal", icon: "#️⃣" },
  thread_insert: { label: "abrió el hilo", icon: "🧵" },
  thread_update: { label: "cambió el hilo", icon: "🧵" },
  thread_delete: { label: "borró el hilo", icon: "🧵" },
  channel_perms_update: { label: "cambió los permisos de", icon: "🔒" },
  member_kick: { label: "echó a", icon: "🚪" },
  member_ban: { label: "baneó a", icon: "🔨" },
  member_unban: { label: "desbaneó a", icon: "🕊️" },
  member_timeout: { label: "aisló a", icon: "⏳" },
  member_timeout_remove: { label: "le quitó el aislamiento a", icon: "⌛" },
  member_voice_mod: { label: "cambió la voz de", icon: "🎙️" },
  server_update: { label: "cambió el servidor", icon: "⚙️" },
  message_delete: { label: "borró un mensaje de", icon: "🗑️" },
  message_pin: { label: "fijó un mensaje de", icon: "📌" },
  message_unpin: { label: "desfijó un mensaje de", icon: "📌" },
  emoji_insert: { label: "subió el emoji", icon: "😀" },
  emoji_update: { label: "renombró el emoji", icon: "😀" },
  emoji_delete: { label: "borró el emoji", icon: "😀" },
};

const FILTERS: { v: string; label: string }[] = [
  { v: "", label: "Todo" },
  { v: "member_", label: "Miembros" },
  { v: "role_", label: "Roles" },
  { v: "channel", label: "Canales" },
  { v: "thread_", label: "Hilos" },
  { v: "message_", label: "Mensajes" },
  { v: "emoji_", label: "Emojis" },
  { v: "server_", label: "Servidor" },
];

const permName = (id: string) => PERMS.find((p) => p.id === id)?.label ?? id;
const KEYS: Record<string, string> = {
  nombre: "Nombre", color: "Color", tema: "Tema", categoria: "Categoría", icono: "Ícono", invitacion: "Invitación", rol: "Rol",
  motivo: "Motivo", hasta: "Hasta", canal: "Canal", para: "Para", silenciado: "Silenciado", ensordecido: "Ensordecido",
  permisos: "Permisos", permisos_dados: "Permisos dados", permisos_sacados: "Permisos sacados",
  everyone_dados: "@everyone ganó", everyone_sacados: "@everyone perdió", permitido: "Permitido", denegado: "Denegado",
};

function detailLines(d: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(d ?? {})) {
    if (k === "tipo" || v === null || v === undefined) continue;
    const label = KEYS[k] ?? k;
    if (Array.isArray(v) && v.length === 2 && (k === "nombre" || k === "color" || k === "tema")) out.push(`${label}: ${v[0] || "—"} → ${v[1] || "—"}`);
    else if (Array.isArray(v)) {
      if (v.length) out.push(`${label}: ${v.map((x) => permName(String(x))).join(", ")}`);
    } else if (typeof v === "boolean") out.push(`${label}: ${v ? "sí" : "no"}`);
    else if (k === "hasta") out.push(`${label}: ${untilText(String(v))}`);
    else out.push(`${label}: ${String(v)}`);
  }
  return out;
}

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function AuditLog({ server }: { server: Server }) {
  const profiles = useStore((s) => s.profiles);
  const members = useStore((s) => s.members[server.id]) ?? [];
  const [filter, setFilter] = useState("");
  const [actor, setActor] = useState("");
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    setRows(null);
    setErr("");
    loadAudit(server.id, { action: filter || undefined, actor: actor || undefined }).then(
      (r) => {
        if (!on) return;
        setRows(r);
        setMore(r.length === 50);
      },
      (e) => on && (setErr(friendlyError(e)), setRows([])),
    );
    return () => {
      on = false;
    };
  }, [server.id, filter, actor]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    try {
      const r = await loadAudit(server.id, { action: filter || undefined, actor: actor || undefined, before: last.id });
      setRows((x) => [...(x ?? []), ...r]);
      setMore(r.length === 50);
    } catch (e) {
      toast(friendlyError(e), "error");
    }
  };

  return (
    <div className="audit">
      <p className="hint">Todo lo que cambian los que moderan el servidor: roles, canales, baneos, aislamientos, mensajes borrados y más.</p>
      <div className="audit-filters">
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por acción">
          {FILTERS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.label}
            </option>
          ))}
        </select>
        <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filtrar por persona">
          <option value="">Cualquier persona</option>
          {members
            .map((id) => profiles[id])
            .filter((p): p is Profile => !!p && !p.is_bot)
            .sort((a, b) => a.display_name.localeCompare(b.display_name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
        </select>
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      {!rows ? (
        <p className="hint">Cargando…</p>
      ) : !rows.length ? (
        <p className="hint">Todavía no hay nada registrado{filter || actor ? " con ese filtro" : ""}.</p>
      ) : (
        <ul className="audit-list">
          {rows.map((r) => {
            const a = ACTIONS[r.action] ?? { label: r.action, icon: "•" };
            const who = r.actor_id ? profiles[r.actor_id] : null;
            const lines = detailLines(r.details);
            return (
              <li key={r.id} className="audit-row">
                <span className="audit-ico" aria-hidden>
                  {a.icon}
                </span>
                <Avatar p={who} size="sm" />
                <div className="audit-text">
                  <div>
                    <b>{who?.display_name ?? (r.actor_id ? "Alguien" : "Fogón")}</b> {a.label}{" "}
                    {r.target_name && <b>{r.target_type === "channel" && !r.action.startsWith("thread") ? "#" : ""}{r.target_name}</b>}
                    <span className="hint"> · {ago(r.at)}</span>
                  </div>
                  {!!lines.length && (
                    <ul className="audit-details">
                      {lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {more && (
        <button className="btn ghost" onClick={() => void loadMore()}>
          Ver más
        </button>
      )}
    </div>
  );
}
