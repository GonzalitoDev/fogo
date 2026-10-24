"use client";

import { useMemo, useState } from "react";
import { can, fail, kickMember, nameColor, openDm, rolesOf, topPosition, useStore } from "@/lib/store";
import type { Profile, Role, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { MemberRolesDialog } from "./Roles";
import { Avatar, Confirm, type MenuItem } from "./ui";
import { BadgeRow, ProfileCard } from "./Badges";

export function MemberList({ server }: { server: Server }) {
  const state = useStore((s) => s);
  const me = state.me;
  const [menu, setMenu] = useState<{ p: Profile; at: { x: number; y: number } } | null>(null);
  const [kick, setKick] = useState<Profile | null>(null);
  const [assign, setAssign] = useState<Profile | null>(null);

  // grupos: por el rol "destacado" más alto de cada uno; el resto va a "Miembros"
  const groups = useMemo(() => {
    const ids = state.members[server.id] ?? [];
    const byRole = new Map<string, { role: Role | null; people: Profile[] }>();
    for (const id of ids) {
      const p = state.profiles[id];
      if (!p) continue;
      const hoisted = rolesOf(state, server.id, id).find((r) => r.hoist) ?? null;
      const key = hoisted?.id ?? "_";
      if (!byRole.has(key)) byRole.set(key, { role: hoisted, people: [] });
      byRole.get(key)!.people.push(p);
    }
    const list = [...byRole.values()];
    for (const g of list) g.people.sort((a, b) => Number(b.id === server.owner_id) - Number(a.id === server.owner_id) || a.display_name.localeCompare(b.display_name));
    return list.sort((a, b) => (b.role?.position ?? -1) - (a.role?.position ?? -1));
  }, [state, server.id, server.owner_id]);

  const total = (state.members[server.id] ?? []).length;
  const canAssign = can(state, server.id, "manage_roles");
  const canKick = can(state, server.id, "kick_members");
  const myTop = topPosition(state, server.id, me?.id ?? "");

  const items = (p: Profile): MenuItem[] => {
    const out: MenuItem[] = [];
    if (p.id !== me?.id) out.push({ label: "Mandar mensaje directo", icon: <Icon name="chat" />, onClick: () => void openDm(p.id).catch(fail) });
    if (canAssign) out.push({ label: "Roles", icon: <Icon name="shield" />, onClick: () => setAssign(p) });
    if (canKick && p.id !== me?.id && p.id !== server.owner_id && topPosition(state, server.id, p.id) < myTop)
      out.push("sep", { label: `Echar a ${p.display_name}`, danger: true, icon: <Icon name="door" />, onClick: () => setKick(p) });
    if (!out.length) out.push({ label: "Editá tu perfil desde el engranaje de abajo", onClick: () => {} });
    return out;
  };

  return (
    <aside className="members" aria-label="Miembros">
      {groups.map((g) => (
        <div key={g.role?.id ?? "_"} className="member-group">
          <h3>
            {g.role ? g.role.name : total === g.people.length ? "Miembros" : "Sin rol"}, {g.people.length}
          </h3>
          {g.people.map((p) => {
            const roles = rolesOf(state, server.id, p.id);
            return (
              <button key={p.id} className="member" onClick={(e) => setMenu({ p, at: { x: e.clientX, y: e.clientY } })} title={roles.map((r) => r.name).join(", ") || undefined}>
                <Avatar p={p} size="sm" />
                <span className="nm" style={{ color: nameColor(state, server.id, p.id) }}>
                  {p.display_name}
                </span>
                <BadgeRow p={p} max={2} size={12} />
                {p.id === server.owner_id && <span className="tag">dueño</span>}
              </button>
            );
          })}
        </div>
      ))}
      {menu && (
        <ProfileCard
          p={menu.p}
          at={menu.at}
          serverId={server.id}
          onClose={() => setMenu(null)}
          actions={items(menu.p).flatMap((it) => (it === "sep" || it.label.startsWith("Editá") ? [] : [{ label: it.label, onClick: it.onClick, primary: it.label.startsWith("Mandar") }]))}
        />
      )}
      {assign && <MemberRolesDialog server={server} member={assign} onClose={() => setAssign(null)} />}
      {kick && (
        <Confirm
          title={`Echar a ${kick.display_name}`}
          text="Deja de ver el servidor. Puede volver si alguien le pasa el link de invitación."
          action="Echar"
          danger
          onConfirm={() => kickMember(server.id, kick.id).catch(fail)}
          onClose={() => setKick(null)}
        />
      )}
    </aside>
  );
}
