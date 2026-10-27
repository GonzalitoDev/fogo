"use client";

import { useEffect, useMemo, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { deviceName } from "@/lib/security";
import { ownerAccounts, setState, toast, useStore, type AccountRow } from "@/lib/store";
import { Avatar } from "./ui";

type Filter = "all" | "nomfa" | "banned" | "deleted" | "premium" | "inactive";
const FILTERS: [Filter, string][] = [
  ["all", "Todas"],
  ["nomfa", "Sin dos pasos"],
  ["inactive", "Sin entrar hace 30 días"],
  ["premium", "Premium"],
  ["banned", "Baneadas"],
  ["deleted", "Eliminadas"],
];

const when = (d: string | null) => (d ? new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—");
const MONTH = 30 * 24 * 3600 * 1000;

/** Ajustes → Registro de cuentas: todas las cuentas de Fogón. Solo lo ve el dueño (lo controla la base). */
export function AccountsRegistry() {
  const profiles = useStore((s) => s.profiles);
  const [list, setList] = useState<AccountRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showEmails, setShowEmails] = useState(false);
  const load = () =>
    ownerAccounts()
      .then(setList)
      .catch((e) => {
        toast(friendlyError(e), "error");
        setList([]);
      });
  useEffect(() => void load(), []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter((a) => {
      if (t && ![a.username, a.display_name, a.email ?? "", a.last_ip ?? ""].some((x) => x.toLowerCase().includes(t))) return false;
      if (filter === "nomfa") return !a.mfa && !a.deleted;
      if (filter === "banned") return a.banned;
      if (filter === "deleted") return a.deleted;
      if (filter === "premium") return a.premium;
      if (filter === "inactive") return !a.deleted && (!a.last_sign_in_at || Date.now() - +new Date(a.last_sign_in_at) > MONTH);
      return true;
    });
  }, [list, q, filter]);

  const all = list ?? [];
  const stats = [
    ["Cuentas", all.filter((a) => !a.deleted).length],
    ["Nuevas (7 días)", all.filter((a) => Date.now() - +new Date(a.created_at) < 7 * 24 * 3600 * 1000).length],
    ["Activas (30 días)", all.filter((a) => a.last_sign_in_at && Date.now() - +new Date(a.last_sign_in_at) < MONTH).length],
    ["Con dos pasos", all.filter((a) => a.mfa).length],
    ["Baneadas", all.filter((a) => a.banned).length],
  ] as const;

  const exportCsv = () => {
    const cols: (keyof AccountRow)[] = ["username", "display_name", "email", "created_at", "last_sign_in_at", "mfa", "sessions", "last_ip", "banned", "deleted", "premium", "staff", "servers", "messages", "problems"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...shown.map((a) => cols.map((c) => esc(a[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fogon-cuentas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <h1>Registro de cuentas</h1>
      <p className="hint">Todas las cuentas de Fogón con sus datos de acceso. Solo lo ves vos: la base no se lo da a nadie más, ni al staff.</p>
      <div className="acc-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <b>{list ? v : "…"}</b>
            <small>{k}</small>
          </div>
        ))}
      </div>
      <div className="acc-tools">
        <input className="input" type="search" placeholder="Buscar por usuario, nombre, email o IP" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setShowEmails(!showEmails)}>
          {showEmails ? "Ocultar emails" : "Mostrar emails"}
        </button>
        <button className="btn" onClick={exportCsv} disabled={!shown.length}>
          Exportar CSV
        </button>
        <button className="btn ghost" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      <div className="support-chips">
        {FILTERS.map(([f, label]) => (
          <button key={f} className={`tag-chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      {list && <p className="hint">{shown.length === all.length ? `${all.length} cuentas` : `${shown.length} de ${all.length} cuentas`}</p>}
      <ul className="sess-list acc-list">
        {shown.map((a) => (
          <li key={a.id} className="sess acc-row">
            <button className="acc-who" onClick={() => !a.deleted && setState({ fullProfile: a.id })} disabled={a.deleted} title="Ver perfil">
              <Avatar p={profiles[a.id] ?? null} size="sm" />
              <span>
                <b>{a.deleted ? "Usuario eliminado" : a.display_name}</b>
                <small>@{a.username}</small>
              </span>
            </button>
            <div className="acc-data">
              <small>
                📧 {a.email ? (showEmails ? a.email : a.email.replace(/^(.{0,2})[^@]*/, (_, x) => x + "•••")) : "—"}
                {!a.confirmed && " (sin confirmar)"}
              </small>
              <small>
                Creada {when(a.created_at)} · Último ingreso {when(a.last_sign_in_at)}
              </small>
              <small>
                {a.last_device ? `${deviceName(a.last_device)} · ` : ""}
                {a.last_ip ? `IP ${a.last_ip} · ` : ""}
                {a.sessions} {a.sessions === 1 ? "sesión abierta" : "sesiones abiertas"}
              </small>
              <small>
                {a.servers} servidores · {a.messages} mensajes{a.problems ? ` · ${a.problems} reportes` : ""}
              </small>
            </div>
            <div className="acc-tags">
              {a.mfa ? <span className="prob-status st-fixed">🔐 Dos pasos</span> : <span className="prob-status">Sin dos pasos</span>}
              {a.premium && <span className="prob-status">💎 Premium</span>}
              {a.staff && <span className="prob-status">🛠️ Staff</span>}
              {a.banned && (
                <span className="prob-status st-open" title={a.ban_reason ?? ""}>
                  ⛔ Baneada
                </span>
              )}
              {a.deleted && <span className="prob-status">🗑️ Eliminada</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
