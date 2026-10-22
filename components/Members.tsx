"use client";

import { useMemo, useState } from "react";
import { fail, kickMember, openDm, useStore } from "@/lib/store";
import type { Profile, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, Confirm, Menu, type MenuItem } from "./ui";

export function MemberList({ server }: { server: Server }) {
  const ids = useStore((s) => s.members[server.id]);
  const profiles = useStore((s) => s.profiles);
  const me = useStore((s) => s.me);
  const [menu, setMenu] = useState<{ p: Profile; at: { x: number; y: number } } | null>(null);
  const [kick, setKick] = useState<Profile | null>(null);
  const list = useMemo(
    () =>
      (ids ?? [])
        .map((id) => profiles[id])
        .filter((p): p is Profile => !!p)
        .sort((a, b) => Number(b.id === server.owner_id) - Number(a.id === server.owner_id) || a.display_name.localeCompare(b.display_name)),
    [ids, profiles, server.owner_id],
  );
  const owner = me?.id === server.owner_id;
  return (
    <aside className="members" aria-label="Miembros">
      <h3>Miembros, {list.length}</h3>
      {list.map((p) => (
        <button key={p.id} className="member" onClick={(e) => setMenu({ p, at: { x: e.clientX, y: e.clientY } })}>
          <Avatar p={p} size="sm" />
          <span className="nm" style={{ color: p.color }}>
            {p.display_name}
          </span>
          {p.id === server.owner_id && <span className="tag">dueño</span>}
        </button>
      ))}
      {menu && (
        <Menu
          at={menu.at}
          label={menu.p.display_name}
          onClose={() => setMenu(null)}
          items={
            menu.p.id === me?.id
              ? [{ label: "Editá tu perfil desde el engranaje de abajo", onClick: () => {} }]
              : [
                  { label: "Mandar mensaje directo", icon: <Icon name="chat" />, onClick: () => void openDm(menu.p.id).catch(fail) },
                  ...(owner ? (["sep", { label: `Echar a ${menu.p.display_name}`, danger: true, icon: <Icon name="door" />, onClick: () => setKick(menu.p) }] as MenuItem[]) : []),
                ]
          }
        />
      )}
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
