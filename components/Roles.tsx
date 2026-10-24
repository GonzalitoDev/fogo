"use client";

import { useMemo, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { deleteRole, myPerms, rolesOf, saveRole, serverRoles, setMemberRole, topPosition, useStore } from "@/lib/store";
import { PERMS, type Perm, type Profile, type Role, type Server } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, COLORS, Confirm, Modal } from "./ui";

const ROLE_COLORS = ["#99a8a4", ...COLORS];

function RoleDot({ color }: { color: string }) {
  return <span style={{ width: 12, height: 12, borderRadius: "50%", background: color, flex: "none", display: "inline-block" }} aria-hidden="true" />;
}

/** Lista de roles del servidor + editor */
export function RolesDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const state = useStore((s) => s);
  const roles = useMemo(() => serverRoles(state, server.id), [state, server.id]);
  const mine = myPerms(state, server.id);
  const myTop = topPosition(state, server.id, state.me?.id ?? "");
  const [editing, setEditing] = useState<Partial<Role> | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ids of Object.values(state.memberRoles[server.id] ?? {})) for (const id of ids) c[id] = (c[id] ?? 0) + 1;
    return c;
  }, [state.memberRoles, server.id]);

  if (editing)
    return (
      <RoleEditor
        server={server}
        initial={editing}
        myPerms={mine}
        maxPosition={myTop - 1}
        onBack={() => setEditing(null)}
        onClose={onClose}
      />
    );

  const nextPos = Math.min(myTop - 1, Math.max(0, ...roles.filter((r) => r.position < myTop).map((r) => r.position)) + 1);

  return (
    <Modal label="Roles" onClose={onClose}>
      <h2>Roles de {server.name}</h2>
      <p>Los roles dan permisos y color. El de arriba manda: solo podés editar y asignar roles que estén por debajo del tuyo.</p>
      <div style={{ display: "grid", gap: 4 }}>
        {roles.map((r) => {
          const editable = r.position < myTop;
          return (
            <button
              key={r.id}
              className="member"
              onClick={() => editable && setEditing(r)}
              disabled={!editable}
              title={editable ? "Editar rol" : "Está a tu altura o más arriba: no lo podés editar"}
              style={{ opacity: editable ? 1 : 0.6 }}
            >
              <RoleDot color={r.color} />
              <span className="nm" style={{ color: r.color }}>
                {r.name}
              </span>
              <span className="hint">
                {counts[r.id] ?? 0} {counts[r.id] === 1 ? "miembro" : "miembros"}
                {r.auto_assign ? " · automático" : ""}
              </span>
              {editable && <Icon name="edit" />}
            </button>
          );
        })}
        {!roles.length && <p className="hint">Todavía no hay roles. Creá uno, por ejemplo “Moderador”.</p>}
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>
          Cerrar
        </button>
        <button className="btn primary" disabled={nextPos < 1} onClick={() => setEditing({ name: "", color: ROLE_COLORS[1], position: Math.max(1, nextPos), hoist: true, perms: [] })}>
          <Icon name="plus" /> Crear rol
        </button>
      </div>
    </Modal>
  );
}

function RoleEditor(p: { server: Server; initial: Partial<Role>; myPerms: Set<Perm>; maxPosition: number; onBack: () => void; onClose: () => void }) {
  const [name, setName] = useState(p.initial.name ?? "");
  const [color, setColor] = useState(p.initial.color ?? ROLE_COLORS[0]);
  const [position, setPosition] = useState(p.initial.position ?? 1);
  const [hoist, setHoist] = useState(p.initial.hoist ?? true);
  const [auto, setAuto] = useState(p.initial.auto_assign ?? false);
  const [perms, setPerms] = useState<Perm[]>(p.initial.perms ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const toggle = (perm: Perm) => setPerms((cur) => (cur.includes(perm) ? cur.filter((x) => x !== perm) : [...cur, perm]));

  return (
    <Modal label={p.initial.id ? "Editar rol" : "Crear rol"} onClose={p.onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          setErr("");
          try {
            await saveRole({ id: p.initial.id, server_id: p.server.id, name, color, position, hoist, perms, auto_assign: auto });
            p.onBack();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Volver a la lista de roles">
            <Icon name="chevron" className="rot90" />
          </button>
          <h2>{p.initial.id ? `Editar ${p.initial.name}` : "Crear rol"}</h2>
        </div>
        <label className="field">
          <span>Nombre</span>
          <input id="role-name" className="input" autoFocus maxLength={50} value={name} placeholder="Moderador" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="colors" role="radiogroup" aria-label="Color del rol">
            {ROLE_COLORS.map((c, i) => (
              <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={i === 0 ? "Sin color" : c} title={i === 0 ? "Sin color" : undefined} className="color" style={{ ["--c" as string]: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <label className="field">
          <span>Posición</span>
          <input
            id="role-position"
            className="input"
            type="number"
            min={1}
            max={p.maxPosition}
            value={position}
            onChange={(e) => setPosition(Math.max(1, Math.min(p.maxPosition, Number(e.target.value) || 1)))}
          />
          <span className="hint" style={{ fontWeight: 400 }}>
            Más alto manda más. Podés usar de 1 a {p.maxPosition}.
          </span>
        </label>
        <label className="radio">
          <input type="checkbox" checked={hoist} onChange={(e) => setHoist(e.target.checked)} /> Mostrar a sus miembros aparte en la lista
        </label>
        <label className="radio">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Darlo solo a los miembros nuevos cuando entran al servidor
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 4 }}>
          <legend className="field" style={{ marginBottom: 6 }}>
            <span>Permisos</span>
          </legend>
          {PERMS.map((perm) => {
            const allowed = p.myPerms.has(perm.id);
            return (
              <label key={perm.id} className="radio" style={{ alignItems: "flex-start", opacity: allowed ? 1 : 0.55 }} title={allowed ? undefined : "No podés dar un permiso que no tenés"}>
                <input type="checkbox" checked={perms.includes(perm.id)} disabled={!allowed} onChange={() => toggle(perm.id)} style={{ marginTop: 2 }} />
                <span>
                  <b style={{ fontWeight: 600 }}>{perm.label}</b>
                  <br />
                  <span className="hint">{perm.help}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <div className="foot">
          {p.initial.id && (
            <button type="button" className="btn danger" style={{ marginRight: "auto" }} onClick={() => setConfirm(true)}>
              Borrar rol
            </button>
          )}
          <button type="button" className="btn ghost" onClick={p.onBack}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            {p.initial.id ? "Guardar" : "Crear rol"}
          </button>
        </div>
      </form>
      {confirm && p.initial.id && (
        <Confirm
          title={`Borrar el rol ${p.initial.name}`}
          text="Se lo saca a todos los que lo tienen. Los miembros no se van del servidor."
          action="Borrar rol"
          danger
          onConfirm={async () => {
            try {
              await deleteRole(p.initial.id!);
              p.onBack();
            } catch (e) {
              setErr(friendlyError(e));
            }
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </Modal>
  );
}

/** Asignar o sacar roles a un miembro */
export function MemberRolesDialog({ server, member, onClose }: { server: Server; member: Profile; onClose: () => void }) {
  const state = useStore((s) => s);
  const roles = useMemo(() => serverRoles(state, server.id), [state, server.id]);
  const has = new Set(rolesOf(state, server.id, member.id).map((r) => r.id));
  const myTop = topPosition(state, server.id, state.me?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  return (
    <Modal label={`Roles de ${member.display_name}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Avatar p={member} />
        <div>
          <h2>{member.display_name}</h2>
          <span className="hint">@{member.username}</span>
        </div>
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        {roles.map((r) => {
          const editable = r.position < myTop;
          return (
            <label key={r.id} className="radio" style={{ opacity: editable ? 1 : 0.55 }} title={editable ? undefined : "Este rol está a tu altura o más arriba"}>
              <input
                type="checkbox"
                checked={has.has(r.id)}
                disabled={!editable || busy === r.id}
                onChange={async (e) => {
                  setBusy(r.id);
                  setErr("");
                  try {
                    await setMemberRole(server.id, member.id, r.id, e.target.checked);
                  } catch (e) {
                    setErr(friendlyError(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              />
              <RoleDot color={r.color} />
              <span style={{ color: r.color, fontWeight: 600 }}>{r.name}</span>
            </label>
          );
        })}
        {!roles.length && <p className="hint">Este servidor no tiene roles. Crealos desde el menú del servidor → Roles.</p>}
      </div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div className="foot">
        <button className="btn" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}
