"use client";

import { useMemo, useState } from "react";
import { can, fail, kickMember, nameColor, openDm, presenceOf, rolesOf, serverBoosters, setTimeoutFor, timeoutOf, toast, topPosition, useStore } from "@/lib/store";
import type { Profile, Role, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { MemberRolesDialog } from "./Roles";
import { Name } from "./Name";
import { Avatar, Confirm, type MenuItem } from "./ui";
import { BadgeRow } from "./Badges";
import { ProfilePopout } from "./Profile";
import { BanDialog, TimeoutDialog, untilText } from "./Moderation";
import { BotTag } from "./Permissions";
import { BoostGem } from "./Boost";

export function MemberList({ server }: { server: Server }) {
  const state = useStore((s) => s);
  const boosters = serverBoosters(state, server.id);
  const me = state.me;
  const [menu, setMenu] = useState<{ p: Profile; at: { x: number; y: number } } | null>(null);
  const [kick, setKick] = useState<Profile | null>(null);
  const [assign, setAssign] = useState<Profile | null>(null);

  // grupos: por el rol "destacado" más alto de cada uno; el resto va a "Miembros"
  const groups = useMemo(() => {
    const ids = state.members[server.id] ?? [];
    const byRole = new Map<string, { role: Role | null; people: Profile[] }>();
    const offline: Profile[] = [];
    for (const id of ids) {
      const p = state.profiles[id];
      if (!p) continue;
      if (presenceOf(state, id) === "offline") {
        offline.push(p);
        continue;
      }
      const hoisted = rolesOf(state, server.id, id).find((r) => r.hoist) ?? null;
      const key = hoisted?.id ?? "_";
      if (!byRole.has(key)) byRole.set(key, { role: hoisted, people: [] });
      byRole.get(key)!.people.push(p);
    }
    const list = [...byRole.values()];
    for (const g of list) g.people.sort((a, b) => Number(b.id === server.owner_id) - Number(a.id === server.owner_id) || a.display_name.localeCompare(b.display_name));
    list.sort((a, b) => (b.role?.position ?? -1) - (a.role?.position ?? -1));
    offline.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return { online: list, offline };
  }, [state, server.id, server.owner_id]);

  const total = (state.members[server.id] ?? []).length;
  const canAssign = can(state, server.id, "manage_roles");
  const canKick = can(state, server.id, "kick_members");
  const canBan = can(state, server.id, "ban_members");
  const canTimeout = can(state, server.id, "moderate_members");
  const [ban, setBan] = useState<Profile | null>(null);
  const [isolate, setIsolate] = useState<Profile | null>(null);
  const myTop = topPosition(state, server.id, me?.id ?? "");

  const items = (p: Profile): MenuItem[] => {
    const out: MenuItem[] = [];
    if (p.id !== me?.id) out.push({ label: "Mandar mensaje directo", icon: <Icon name="chat" />, onClick: () => void openDm(p.id).catch(fail) });
    if (canAssign) out.push({ label: "Roles", icon: <Icon name="shield" />, onClick: () => setAssign(p) });
    const below = p.id !== me?.id && p.id !== server.owner_id && topPosition(state, server.id, p.id) < myTop;
    const iso = timeoutOf(state, server.id, p.id);
    const isAdminish = p.id === server.owner_id || rolesOf(state, server.id, p.id).some((r) => r.perms.includes("administrator"));
    if (canTimeout && below && !isAdminish && !p.is_bot) {
      out.push("sep");
      if (iso)
        out.push({
          label: `Quitar aislamiento a ${p.display_name}`,
          icon: <Icon name="clock" />,
          onClick: () => void setTimeoutFor(server.id, p.id, 0).then(() => toast(`${p.display_name} ya no está aislado`), fail),
        });
      else out.push({ label: `Aislar a ${p.display_name}`, danger: true, icon: <Icon name="clock" />, onClick: () => setIsolate(p) });
    }
    if (canKick && below) out.push("sep", { label: `Echar a ${p.display_name}`, danger: true, icon: <Icon name="door" />, onClick: () => setKick(p) });
    if (canBan && below) out.push({ label: `Banear a ${p.display_name}`, danger: true, icon: <Icon name="door" />, onClick: () => setBan(p) });
    if (!out.length) out.push({ label: "Editá tu perfil desde el engranaje de abajo", onClick: () => {} });
    return out;
  };

  return (
    <aside className="members" aria-label="Miembros">
      {[...groups.online.map((g) => ({ key: g.role?.id ?? "_", title: g.role ? g.role.name : "En línea", people: g.people, off: false })), ...(groups.offline.length ? [{ key: "off", title: "Desconectados", people: groups.offline, off: true }] : [])].map((g) => (
        <div key={g.key} className={"member-group" + (g.off ? " is-offline" : "")}>
          <h3>
            {g.title} — {g.people.length}
          </h3>
          {g.people.map((p) => {
            const roles = rolesOf(state, server.id, p.id);
            return (
              <button
                key={p.id}
                className="member"
                onClick={(e) => setMenu({ p, at: { x: e.clientX, y: e.clientY } })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ p, at: { x: e.clientX, y: e.clientY } });
                }}
                title={roles.map((r) => r.name).join(", ") || undefined}
              >
                <Avatar p={p} size="sm" status={presenceOf(state, p.id)} />
                <span className="member-text">
                  <span className="member-line">
                    <span className="nm">
                      <Name p={p} color={nameColor(state, server.id, p.id)} />
                    </span>
                    {p.is_bot && <BotTag official={p.is_official} />}
                    {boosters[p.id] && <BoostGem className="member-boost" title={`Boostea este servidor${boosters[p.id] > 1 ? ` ×${boosters[p.id]}` : ""}`} />}
                    {p.id === server.owner_id && (
                      <span className="crown" title="Dueño del servidor" aria-label="Dueño del servidor">
                        👑
                      </span>
                    )}
                    {timeoutOf(state, server.id, p.id) && (
                      <span className="member-timeout" title={`Aislado hasta ${untilText(timeoutOf(state, server.id, p.id)!.until)}`} aria-label="Aislado">
                        ⏳
                      </span>
                    )}
                    <BadgeRow p={p} max={2} size={12} />
                  </span>
                  {p.custom_status && <span className="member-status">{p.custom_status}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {menu && (
        <ProfilePopout
          p={menu.p}
          at={menu.at}
          serverId={server.id}
          onClose={() => setMenu(null)}
          actions={items(menu.p).flatMap((it) => (it === "sep" || it.label.startsWith("Editá") || it.label.startsWith("Mandar") ? [] : [{ label: it.label, onClick: it.onClick, danger: it.danger }]))}
        />
      )}
      {isolate && <TimeoutDialog server={server} member={isolate} onClose={() => setIsolate(null)} />}
      {ban && <BanDialog server={server} member={ban} onClose={() => setBan(null)} />}
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
