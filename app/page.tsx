"use client";

import { useEffect, useState } from "react";
import { configured } from "@/lib/supabase";
import { boot, can, getState, setState, useStore } from "@/lib/store";
import type { Channel, Server } from "@/lib/types";
import { AuthScreen, ProfileSetup } from "@/components/Auth";
import { ChatPane } from "@/components/Chat";
import {
  ChannelDialog,
  CreateServerDialog,
  InviteAcceptDialog,
  InviteDialog,
  LeaveServerDialog,
  NewDmDialog,
  ProfileDialog,
  ServerSettingsDialog,
} from "@/components/Dialogs";
import { Ember, Icon } from "@/components/Icon";
import { MemberList } from "@/components/Members";
import { DmSidebar, Rail, ServerSidebar, type NavDialogs } from "@/components/Nav";
import { QuickSwitcher } from "@/components/Switcher";
import { RolesDialog } from "@/components/Roles";
import { FullProfile } from "@/components/Profile";
import { BansDialog } from "@/components/Moderation";

type Dialog =
  | { kind: "create" }
  | { kind: "invite"; server: Server }
  | { kind: "accept"; code: string }
  | { kind: "settings"; server: Server }
  | { kind: "leave"; server: Server }
  | { kind: "roles"; server: Server }
  | { kind: "bans"; server: Server }
  | { kind: "channel"; initial: Partial<Channel> & { server_id: string; kind: "text" | "category" } }
  | { kind: "dm" }
  | { kind: "profile" }
  | { kind: "switcher" };

export default function Page() {
  const ready = useStore((s) => s.ready);
  const session = useStore((s) => s.session);
  const needsProfile = useStore((s) => s.needsProfile);
  const me = useStore((s) => s.me);
  const place = useStore((s) => s.place);
  const servers = useStore((s) => s.servers);
  const channel = useStore((s) => (s.place.channelId ? s.channels[s.place.channelId] : undefined));
  const toast = useStore((s) => s.toast);
  const editingProfile = useStore((s) => s.editingProfile);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);

  useEffect(() => {
    if (configured) void boot();
    try {
      setMembersOpen(localStorage.getItem("fogon:members") !== "0" && window.innerWidth > 1100);
    } catch {}
  }, []);

  // invitación en la URL: se guarda hasta que haya sesión y perfil
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("invite");
    if (code) {
      try {
        sessionStorage.setItem("fogon:invite", code);
      } catch {}
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }, []);
  useEffect(() => {
    if (!ready || !me) return;
    let code: string | null = null;
    try {
      code = sessionStorage.getItem("fogon:invite");
      sessionStorage.removeItem("fogon:invite");
    } catch {}
    if (code) setDialog({ kind: "accept", code });
  }, [ready, me]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setState({ toast: null }), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!me) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog((d) => (d?.kind === "switcher" ? null : { kind: "switcher" }));
      }
      if (mod && e.key.toLowerCase() === "u") {
        e.preventDefault();
        toggleMembers();
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const arr = [...document.querySelectorAll<HTMLButtonElement>(".side .chan .label")];
        const i = arr.findIndex((b) => b.closest(".chan")?.classList.contains("active"));
        arr[(i + (e.key === "ArrowDown" ? 1 : -1) + arr.length) % arr.length]?.click();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const toggleMembers = () =>
    setMembersOpen((o) => {
      try {
        localStorage.setItem("fogon:members", o ? "0" : "1");
      } catch {}
      return !o;
    });

  if (!configured)
    return (
      <main className="auth">
        <div className="auth-card">
          <h2>Falta configurar Supabase</h2>
          <p className="hint">Copiá .env.example a .env.local y completá la URL y la publishable key de tu proyecto.</p>
        </div>
      </main>
    );
  if (!ready)
    return (
      <main className="auth" aria-busy="true">
        <Ember className="ember-load" />
      </main>
    );
  if (!session) return <AuthScreen />;
  if (needsProfile || !me) return <ProfileSetup />;

  const dialogs: NavDialogs = {
    createServer: () => setDialog({ kind: "create" }),
    invite: (server) => setDialog({ kind: "invite", server }),
    serverSettings: (server) => setDialog({ kind: "settings", server }),
    channelEdit: (initial) => setDialog({ kind: "channel", initial }),
    confirmLeave: (server) => setDialog({ kind: "leave", server }),
    roles: (server) => setDialog({ kind: "roles", server }),
    bans: (server) => setDialog({ kind: "bans", server }),
    newDm: () => setDialog({ kind: "dm" }),
    profile: () => setDialog({ kind: "profile" }),
  };
  const server = place.kind === "server" ? servers[place.serverId] : undefined;
  const canManageChannels = can(getState(), server?.id, "manage_channels");
  const showMembers = !!server && membersOpen && !!channel;
  const close = () => setDialog(null);

  return (
    <div className={`app${showMembers ? " members-open" : ""}`}>
      <div className={`nav-drawer${drawer ? " open" : ""}`}>
        <Rail dialogs={dialogs} onNavigate={() => setDrawer(false)} />
        {server ? <ServerSidebar server={server} dialogs={dialogs} onNavigate={() => setDrawer(false)} /> : <DmSidebar dialogs={dialogs} onNavigate={() => setDrawer(false)} />}
      </div>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}

      {channel && channel.kind !== "category" ? (
        <ChatPane key={channel.id} channel={channel} onMenu={() => setDrawer(true)} membersOpen={showMembers} onToggleMembers={toggleMembers} />
      ) : (
        <section className="chat">
          <header className="chat-head">
            <button className="icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="Abrir navegación">
              <Icon name="menu" />
            </button>
            <h2>{server ? server.name : "Mensajes directos"}</h2>
          </header>
          <div className="home">
            <div className="inner">
              <Ember className="ember" />
              {server ? (
                <>
                  <h2>No hay canales para mostrar</h2>
                  <p>{canManageChannels ? "Creá un canal desde el menú del servidor." : "Todavía nadie creó canales."}</p>
                </>
              ) : Object.keys(servers).length ? (
                <>
                  <h2>Elegí una charla</h2>
                  <p>Abrí un mensaje directo de la lista, o tocá + para hablarle a alguien por su @usuario.</p>
                  <button className="btn primary" onClick={dialogs.newDm}>
                    Nuevo mensaje directo
                  </button>
                </>
              ) : (
                <>
                  <h2>Prendé el primer fogón</h2>
                  <p>Creá un servidor para tu grupo de amigos o unite con el link que te pasaron.</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <button className="btn primary" onClick={dialogs.createServer}>
                      Crear servidor
                    </button>
                    <button className="btn" onClick={dialogs.createServer}>
                      Tengo una invitación
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {showMembers && server && <MemberList server={server} />}

      {dialog?.kind === "create" && <CreateServerDialog onClose={close} />}
      {dialog?.kind === "invite" && <InviteDialog server={dialog.server} onClose={close} />}
      {dialog?.kind === "accept" && <InviteAcceptDialog code={dialog.code} onClose={close} />}
      {dialog?.kind === "settings" && <ServerSettingsDialog server={dialog.server} onClose={close} />}
      {dialog?.kind === "leave" && <LeaveServerDialog server={dialog.server} onClose={close} />}
      {dialog?.kind === "roles" && <RolesDialog server={dialog.server} onClose={close} />}
      {dialog?.kind === "bans" && <BansDialog server={dialog.server} onClose={close} />}
      {dialog?.kind === "channel" && <ChannelDialog initial={dialog.initial} onClose={close} />}
      {dialog?.kind === "dm" && <NewDmDialog onClose={close} />}
      {(dialog?.kind === "profile" || editingProfile) && (
        <ProfileDialog
          onClose={() => {
            close();
            setState({ editingProfile: false });
          }}
        />
      )}
      <FullProfile />
      {dialog?.kind === "switcher" && <QuickSwitcher onClose={close} />}

      {toast && (
        <div key={toast.id} className={`toast${toast.tone === "error" ? " error" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

