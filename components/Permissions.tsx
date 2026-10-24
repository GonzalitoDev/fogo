"use client";

import { useMemo, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { removeOverride, serverRoles, setOverride, toast, useStore } from "@/lib/store";
import { CHAN_PERMS, type Channel, type ChanPerm } from "@/lib/types";
import { Icon } from "./Icon";

/** Etiqueta BOT como en Discord (u OFICIAL para la cuenta de Fogón). */
export function BotTag({ official }: { official?: boolean }) {
  return (
    <span className={`bot-tag${official ? " official" : ""}`} title={official ? "Cuenta oficial de Fogón" : "Bot de la comunidad: no es una persona"}>
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <path d="M6.6 11.6 3 8l1.1-1.1 2.5 2.5L11.9 4 13 5.1z" fill="currentColor" />
      </svg>
      {official ? "OFICIAL" : "BOT"}
    </span>
  );
}

type Val = "allow" | "deny" | "inherit";

/** Permisos de una categoría o canal: @everyone y roles, cada permiso en ✕ / ⁄ / ✓. */
export function ChannelPermissions({ channel }: { channel: Channel }) {
  const st = useStore((s) => s);
  const list = useMemo(() => st.overrides[channel.id] ?? [], [st.overrides, channel.id]);
  const roles = serverRoles(st, channel.server_id!);
  const [target, setTarget] = useState<string | null>(null); // null = @everyone
  const [adding, setAdding] = useState(false);
  const isCat = channel.kind === "category";
  const parent = channel.parent_id ? st.channels[channel.parent_id] : undefined;

  const shown = [null, ...roles.filter((r) => list.some((o) => o.role_id === r.id)).map((r) => r.id)];
  if (target && !shown.includes(target)) shown.push(target);
  const cur = list.find((o) => (o.role_id ?? null) === target);
  const val = (p: ChanPerm): Val => (cur?.allow.includes(p) ? "allow" : cur?.deny.includes(p) ? "deny" : "inherit");
  const set = (p: ChanPerm, v: Val) => setOverride(channel.server_id!, channel.id, target, p, v).catch((e) => toast(friendlyError(e), "error"));
  const everyone = list.find((o) => !o.role_id);
  const priv = !!everyone?.deny.includes("view_channel");
  const roleName = (id: string | null) => (id ? roles.find((r) => r.id === id)?.name ?? "Rol" : "@everyone");

  return (
    <div className="perms">
      <div className="perms-private">
        <div>
          <b>
            <Icon name="lock" /> {isCat ? "Categoría privada" : "Canal privado"}
          </b>
          <p className="hint">Solo los roles que elijas (y quienes administran canales) {isCat ? "van a ver los canales de esta categoría" : "van a ver este canal"}.</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={priv} onChange={(e) => void setOverride(channel.server_id!, channel.id, null, "view_channel", e.target.checked ? "deny" : "inherit").catch((er) => toast(friendlyError(er), "error"))} />
          <span />
        </label>
      </div>
      {!isCat && parent && <p className="hint">Este canal toma los permisos de la categoría «{parent.name}». Lo que cambies acá se aplica encima.</p>}
      <div className="perms-grid">
        <div className="perms-targets">
          <h3>Roles y miembros</h3>
          {shown.map((id) => (
            <button key={id ?? "everyone"} className={target === id ? "on" : ""} onClick={() => setTarget(id)}>
              <span className="role-dot" style={{ background: id ? roles.find((r) => r.id === id)?.color : "#99a8a4" }} />
              {roleName(id)}
            </button>
          ))}
          {adding ? (
            <select
              className="input"
              autoFocus
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) setTarget(e.target.value);
                setAdding(false);
              }}
              onBlur={() => setAdding(false)}
              aria-label="Elegir rol"
            >
              <option value="">Elegí un rol…</option>
              {roles
                .filter((r) => !shown.includes(r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          ) : (
            roles.some((r) => !shown.includes(r.id)) && (
              <button className="perms-add" onClick={() => setAdding(true)}>
                <Icon name="plus" /> Añadir un rol
              </button>
            )
          )}
        </div>
        <div className="perms-list">
          <h3>
            Permisos de {roleName(target)}
            {target && cur && (
              <button className="link-btn danger" onClick={() => removeOverride(channel.id, target).then(() => setTarget(null), (e) => toast(friendlyError(e), "error"))}>
                Quitar
              </button>
            )}
          </h3>
          {CHAN_PERMS.map((p) => {
            const v = val(p.id);
            return (
              <div key={p.id} className="perm-row">
                <div>
                  <b>{p.label}</b>
                  <p className="hint">{p.help}</p>
                </div>
                <div className="tri" role="radiogroup" aria-label={p.label}>
                  <button type="button" role="radio" aria-checked={v === "deny"} className={"deny" + (v === "deny" ? " on" : "")} onClick={() => set(p.id, "deny")} aria-label="Denegar" title="Denegar">
                    <Icon name="close" />
                  </button>
                  <button type="button" role="radio" aria-checked={v === "inherit"} className={"inherit" + (v === "inherit" ? " on" : "")} onClick={() => set(p.id, "inherit")} aria-label="Heredar" title="Heredar">
                    <span>/</span>
                  </button>
                  <button type="button" role="radio" aria-checked={v === "allow"} className={"allow" + (v === "allow" ? " on" : "")} onClick={() => set(p.id, "allow")} aria-label="Permitir" title="Permitir">
                    <Icon name="check" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
