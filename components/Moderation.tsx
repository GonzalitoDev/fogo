"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { banMember, listBans, toast, unban, useStore } from "@/lib/store";
import type { Ban, Profile, Server } from "@/lib/types";
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
