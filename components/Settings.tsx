"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import { can, fail, mediaUrl, openSettings, setSounds, signOut, toast, unblockUser, useStore } from "@/lib/store";
import type { Server } from "@/lib/types";
import { Icon } from "./Icon";
import { ProfileDialog, InviteDialog, ServerSettingsDialog } from "./Dialogs";
import { RolesDialog } from "./Roles";
import { BansDialog } from "./Moderation";
import { Avatar, InlineModal, useEscape } from "./ui";
import { setNoiseMode, startMicTest, type MicTest, type NoiseMode } from "@/lib/voice";

type Section = { id: string; label: string; danger?: boolean } | { group: string };

/** Pantalla completa con barra lateral, como los ajustes de Discord. */
function SettingsShell({ sections, active, onPick, children, footer }: { sections: Section[]; active: string; onPick: (id: string) => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const close = () => openSettings(null);
  const first = sections.find((x): x is { id: string; label: string } => "id" in x)?.id;
  // en el celu, como Discord: primero la lista de secciones y al tocar una se abre a pantalla completa
  const [open, setOpen] = useState(active !== first);
  const title = sections.find((x): x is { id: string; label: string } => "id" in x && x.id === active)?.label ?? "";
  useEscape(() => (open && window.matchMedia("(max-width: 760px)").matches ? setOpen(false) : close()));
  return (
    <div className={`settings ${open ? "m-content" : "m-list"}`} role="dialog" aria-modal="true" aria-label="Ajustes">
      <nav className="settings-side" aria-label="Secciones">
        <div className="settings-mtop">
          <b>Ajustes</b>
          <button onClick={close} aria-label="Cerrar ajustes">
            <Icon name="close" />
          </button>
        </div>
        <div className="settings-side-in">
          {sections.map((s, i) =>
            "group" in s ? (
              <h3 key={"g" + i}>{s.group}</h3>
            ) : (
              <button
                key={s.id}
                className={(active === s.id ? "on" : "") + (s.danger ? " danger" : "")}
                onClick={() => {
                  onPick(s.id);
                  setOpen(true);
                }}
                aria-current={active === s.id ? "page" : undefined}
              >
                {s.label}
                <span className="settings-chev" aria-hidden="true">
                  <Icon name="chevron" />
                </span>
              </button>
            ),
          )}
          {footer}
        </div>
      </nav>
      <main className="settings-main">
        <div className="settings-mtop">
          <button onClick={() => setOpen(false)} aria-label="Volver a los ajustes">
            <Icon name="chevron" className="back" />
          </button>
          <b>{title}</b>
          <button onClick={close} aria-label="Cerrar ajustes">
            <Icon name="close" />
          </button>
        </div>
        <div className="settings-content">
          <InlineModal.Provider value={true}>{children}</InlineModal.Provider>
        </div>
        <div className="settings-close">
          <button onClick={close} aria-label="Cerrar ajustes">
            <Icon name="close" />
          </button>
          <span>ESC</span>
        </div>
      </main>
    </div>
  );
}

export function SettingsScreen() {
  const v = useStore((s) => s.settings);
  const server = useStore((s) => (v?.kind === "server" ? s.servers[v.serverId] : undefined));
  if (!v) return null;
  if (v.kind === "server") return server ? <ServerSettings server={server} section={v.section} /> : null;
  return <UserSettings section={v.section} />;
}

/* ---------- ajustes de usuario ---------- */

function UserSettings({ section }: { section: string }) {
  const pick = (id: string) => openSettings({ kind: "user", section: id });
  const sections: Section[] = [
    { group: "Ajustes de usuario" },
    { id: "account", label: "Mi cuenta" },
    { id: "profiles", label: "Perfiles" },
    { id: "privacy", label: "Privacidad y seguridad" },
    { group: "Ajustes de la aplicación" },
    { id: "appearance", label: "Apariencia" },
    { id: "voice", label: "Voz" },
    { id: "notifications", label: "Notificaciones" },
    { id: "keys", label: "Atajos de teclado" },
  ];
  return (
    <SettingsShell
      sections={sections}
      active={section}
      onPick={pick}
      footer={
        <>
          <hr />
          <button className="danger" onClick={() => void signOut()}>
            Cerrar sesión <Icon name="logout" />
          </button>
          <p className="settings-version">Fogón · hecho en Argentina</p>
        </>
      }
    >
      {section === "account" && <Account onEdit={() => pick("profiles")} />}
      {section === "profiles" && (
        <>
          <h1>Perfiles</h1>
          <ProfileDialog onClose={() => {}} />
        </>
      )}
      {section === "privacy" && <Privacy />}
      {section === "appearance" && <Appearance />}
      {section === "voice" && <VoiceSettings />}
      {section === "notifications" && <Notifications />}
      {section === "keys" && <Keys />}
    </SettingsShell>
  );
}

function Account({ onEdit }: { onEdit: () => void }) {
  const me = useStore((s) => s.me)!;
  const email = useStore((s) => s.session?.user.email ?? "");
  const [show, setShow] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const banner = mediaUrl(me.banner_path);
  const hidden = email.replace(/^(.{0,2})[^@]*/, (_, a) => a + "••••••");
  return (
    <>
      <h1>Mi cuenta</h1>
      <div className="acct-card">
        <div className="acct-banner" style={{ background: banner ? undefined : me.banner_color ?? me.color }}>
          {banner && <img src={banner} alt="" />}
        </div>
        <div className="acct-top">
          <span className="acct-avatar">
            <Avatar p={me} size="xl" />
          </span>
          <b>{me.display_name}</b>
          <button className="btn primary" onClick={onEdit}>
            Editar perfil de usuario
          </button>
        </div>
        <div className="acct-fields">
          <div className="acct-field">
            <div>
              <h4>Nombre visible</h4>
              <p>{me.display_name}</p>
            </div>
            <button className="btn" onClick={onEdit}>
              Editar
            </button>
          </div>
          <div className="acct-field">
            <div>
              <h4>Nombre de usuario</h4>
              <p>{me.username}</p>
            </div>
          </div>
          <div className="acct-field">
            <div>
              <h4>Correo electrónico</h4>
              <p>
                {show ? email : hidden}{" "}
                <button className="link-btn" onClick={() => setShow(!show)}>
                  {show ? "Ocultar" : "Mostrar"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
      <hr className="settings-hr" />
      <h2>Contraseña y autenticación</h2>
      <form
        className="pass-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pass.length < 6) return toast("La contraseña tiene que tener al menos 6 caracteres.", "error");
          if (pass !== pass2) return toast("Las contraseñas no coinciden.", "error");
          setBusy(true);
          const { error } = await supabase.auth.updateUser({ password: pass });
          setBusy(false);
          if (error) return toast(friendlyError(error), "error");
          setPass("");
          setPass2("");
          toast("Cambiaste tu contraseña");
        }}
      >
        <label className="field">
          <span>Contraseña nueva</span>
          <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        <label className="field">
          <span>Repetila</span>
          <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy || !pass}>
          Cambiar contraseña
        </button>
      </form>
    </>
  );
}

function Privacy() {
  const blocked = useStore((s) => s.blocked);
  const profiles = useStore((s) => s.profiles);
  const ids = Object.keys(blocked);
  return (
    <>
      <h1>Privacidad y seguridad</h1>
      <h2>Usuarios bloqueados</h2>
      <p className="hint">Los bloqueados no pueden mandarte mensajes directos ni solicitudes de amistad, y sus mensajes en los servidores se ocultan.</p>
      {!ids.length ? (
        <p className="settings-empty">No bloqueaste a nadie.</p>
      ) : (
        <div className="settings-list">
          {ids.map((id) => (
            <div key={id} className="settings-row">
              <Avatar p={profiles[id]} size="sm" />
              <b>{profiles[id]?.display_name ?? "Usuario"}</b>
              <span className="hint">@{profiles[id]?.username}</span>
              <button className="btn" onClick={() => unblockUser(id).then(() => toast("Desbloqueado"), fail)}>
                Desbloquear
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const FONT_KEY = "fogon:font";
export function applyFont(px: number) {
  document.documentElement.style.setProperty("--chat-font", `${px}px`);
}
export function loadFont() {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    if (v >= 12 && v <= 20) applyFont(v);
  } catch {}
}

function Appearance() {
  const [px, setPx] = useState(() => {
    try {
      return Number(localStorage.getItem(FONT_KEY)) || 16;
    } catch {
      return 16;
    }
  });
  useEffect(() => {
    applyFont(px);
    try {
      localStorage.setItem(FONT_KEY, String(px));
    } catch {}
  }, [px]);
  const me = useStore((s) => s.me);
  return (
    <>
      <h1>Apariencia</h1>
      <div className="appearance-preview">
        <Avatar p={me} />
        <div>
          <b style={{ color: "var(--ink-strong)" }}>{me?.display_name}</b> <span className="hint">hoy a las 21:30</span>
          <p style={{ fontSize: "var(--chat-font, 16px)", margin: "2px 0 0" }}>¿Así se lee bien? Este es el tamaño de los mensajes del chat. 🔥</p>
        </div>
      </div>
      <h2>Escala de la fuente del chat</h2>
      <div className="font-scale">
        {[12, 14, 15, 16, 18, 20].map((v) => (
          <button key={v} className={px === v ? "on" : ""} onClick={() => setPx(v)}>
            {v}px
          </button>
        ))}
      </div>
    </>
  );
}

function Notifications() {
  const sounds = useStore((s) => s.sounds);
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  return (
    <>
      <h1>Notificaciones</h1>
      <div className="settings-toggle">
        <div>
          <b>Avisos de escritorio</b>
          <p className="hint">Te avisa de menciones y mensajes directos cuando Fogón no está a la vista.</p>
        </div>
        {perm === "granted" ? (
          <span className="hint">Activados</span>
        ) : perm === "denied" ? (
          <span className="hint">Bloqueados por el navegador</span>
        ) : perm === "unsupported" ? (
          <span className="hint">No disponible</span>
        ) : (
          <button className="btn primary" onClick={async () => setPerm(await Notification.requestPermission())}>
            Activar
          </button>
        )}
      </div>
      <div className="settings-toggle">
        <div>
          <b>Sonidos</b>
          <p className="hint">Un sonidito cuando te mencionan o te escriben por privado. Lo mismo que el botón de los auriculares.</p>
        </div>
        <label className="switch">
          <input type="checkbox" checked={sounds} onChange={(e) => setSounds(e.target.checked)} />
          <span />
        </label>
      </div>
    </>
  );
}

const NOISE: { id: NoiseMode; label: string; help: string }[] = [
  { id: "ia", label: "IA (RNNoise)", help: "Una red neuronal limpia tu voz en tiempo real: saca teclado, ventilador, perros, tránsito. Recomendado." },
  { id: "navegador", label: "Estándar", help: "La supresión que trae el navegador. Más liviana, saca menos ruido." },
  { id: "off", label: "Ninguna", help: "El micrófono tal cual. Para micrófonos de estudio o música." },
];

function VoiceSettings() {
  const mode = useStore((s) => s.noiseMode);
  const inCall = useStore((s) => !!s.voice);
  const [hear, setHear] = useState(true);
  const [test, setTest] = useState<MicTest | null>(null);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!test) return;
    let raf = 0;
    const tick = () => {
      setLevel(test.level());
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      test.stop();
    };
  }, [test]);
  const restart = async (m: NoiseMode, h: boolean) => {
    setTest(null);
    setErr("");
    try {
      setTest(await startMicTest(m, h));
    } catch (e) {
      setErr((e as Error)?.name === "NotAllowedError" ? "Fogón no tiene permiso para usar tu micrófono." : "No pudimos abrir el micrófono.");
    }
  };
  return (
    <>
      <h1>Voz</h1>
      <h3 className="settings-sub">Supresión de ruido</h3>
      <div className="noise-opts" role="radiogroup" aria-label="Supresión de ruido">
        {NOISE.map((n) => (
          <label key={n.id} className={`kind-opt${mode === n.id ? " on" : ""}`}>
            <Icon name={n.id === "off" ? "mic" : "noise"} />
            <span>
              <b>
                {n.label}
                {n.id === "ia" && <em className="tag-new">IA</em>}
              </b>
              <small>{n.help}</small>
            </span>
            <input
              type="radio"
              name="noise"
              value={n.id}
              checked={mode === n.id}
              onChange={() => {
                void setNoiseMode(n.id);
                if (test) void restart(n.id, hear);
              }}
            />
          </label>
        ))}
      </div>
      {inCall && <p className="hint">Estás en una llamada: el cambio se aplica al toque, sin cortar.</p>}
      <h3 className="settings-sub">Prueba de micrófono</h3>
      <p className="hint">Hablá y fijate cómo te escuchan los demás. Probá prender una canilla o teclear fuerte con y sin la IA.</p>
      <div className="mic-test">
        <button className={`btn ${test ? "" : "primary"}`} onClick={() => (test ? setTest(null) : void restart(mode, hear))}>
          {test ? "Parar" : "Probemos"}
        </button>
        <div className="mic-meter" aria-hidden="true">
          <span style={{ width: `${Math.round((test ? level : 0) * 100)}%` }} />
        </div>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={hear}
          onChange={(e) => {
            setHear(e.target.checked);
            if (test) void restart(mode, e.target.checked);
          }}
        />
        Escucharme mientras pruebo (usá auriculares)
      </label>
      {err && <p className="add-bad">{err}</p>}
    </>
  );
}

function Keys() {
  const rows: [string, string][] = [
    ["Ctrl + K", "Buscar o iniciar una conversación"],
    ["Ctrl + U", "Mostrar u ocultar la lista de miembros"],
    ["Alt + ↑ / ↓", "Canal anterior / siguiente"],
    ["↑ (caja vacía)", "Editar tu último mensaje"],
    ["Shift + Enter", "Salto de línea"],
    ["Esc", "Cancelar respuesta o edición, cerrar ventanas"],
    ["Shift + clic en borrar", "Borrar sin preguntar"],
  ];
  return (
    <>
      <h1>Atajos de teclado</h1>
      <div className="keys">
        {rows.map(([k, d]) => (
          <div key={k} className="key-row">
            <span>{d}</span>
            <kbd>{k}</kbd>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- ajustes del servidor ---------- */

function ServerSettings({ server, section }: { server: Server; section: string }) {
  const st = useStore((s) => s);
  const isOwner = st.me?.id === server.owner_id;
  const pick = (id: string) => openSettings({ kind: "server", serverId: server.id, section: id });
  const sections: Section[] = [
    { group: server.name },
    ...(can(st, server.id, "manage_server") ? [{ id: "overview", label: "Vista general" }] : []),
    ...(can(st, server.id, "manage_roles") ? [{ id: "roles", label: "Roles" }] : []),
    { group: "Gestión de miembros" },
    { id: "invites", label: "Invitaciones" },
    ...(can(st, server.id, "ban_members") ? [{ id: "bans", label: "Baneos" }] : []),
  ];
  const first = sections.find((x): x is { id: string; label: string } => "id" in x)?.id ?? "invites";
  const active = sections.some((x) => "id" in x && x.id === section) ? section : first;
  const close = () => openSettings(null);
  return (
    <SettingsShell sections={sections} active={active} onPick={pick}>
      {active === "overview" && (
        <>
          <h1>Vista general del servidor</h1>
          <ServerSettingsDialog server={server} onClose={() => {}} />
          {!isOwner && <p className="hint">Solo el dueño puede borrar el servidor.</p>}
        </>
      )}
      {active === "roles" && (
        <>
          <h1>Roles</h1>
          <RolesDialog server={server} onClose={close} />
        </>
      )}
      {active === "invites" && (
        <>
          <h1>Invitaciones</h1>
          <InviteDialog server={server} onClose={close} />
        </>
      )}
      {active === "bans" && (
        <>
          <h1>Baneos</h1>
          <BansDialog server={server} onClose={close} />
        </>
      )}
    </SettingsShell>
  );
}
