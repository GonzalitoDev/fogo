"use client";

import { useEffect, useRef, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import { FOGON_OWNER, can, deleteMyAccount, endOtherSessions, endSession, fail, mySessions, securityLog, type MySession, type SecurityEvent, mediaUrl, openSettings, setSounds, signOut, toast, unblockUser, useStore } from "@/lib/store";
import type { Server } from "@/lib/types";
import { Icon } from "./Icon";
import { PasswordMeter } from "./Auth";
import { ProblemsSettings } from "./Problems";
import { AccountsRegistry } from "./Accounts";
import { deviceName, passwordStrength } from "@/lib/security";
import { ProfileDialog, InviteDialog, ServerSettingsDialog } from "./Dialogs";
import { RolesDialog } from "./Roles";
import { AuditLog, BansDialog } from "./Moderation";
import { EmojiSettings } from "./Emoji";
import { Avatar, InlineModal, Modal, useEscape } from "./ui";
import { setNoiseMode, startMicTest, type MicTest, type NoiseMode } from "@/lib/voice";
import { applyAppTheme, EFFECTS, NAME_STYLES, THEMES } from "@/lib/premium";
import { DECO_COLLECTIONS, decoLabel, type AvatarDeco } from "@/lib/decos";
import { ProfileView } from "./Profile";
import { getState, updateProfile, type ProfilePatch } from "@/lib/store";
import type { Profile } from "@/lib/types";

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
  const problems = useStore((s) => s.problemsUnread);
  const owner = useStore((s) => s.me?.id === FOGON_OWNER);
  const sections: Section[] = [
    { group: "Ajustes de usuario" },
    { id: "account", label: "Mi cuenta" },
    { id: "profiles", label: "Perfiles" },
    { id: "decorations", label: "Decoraciones 🎁" },
    { id: "privacy", label: "Privacidad y seguridad" },
    { id: "problems", label: `Problemas 🛠️${problems ? ` (${problems})` : ""}` },
    ...(owner ? [{ id: "accounts", label: "Registro de cuentas 🗂️" }] : []),
    { group: "Fogón Premium" },
    { id: "premium", label: "Premium ✨" },
    { group: "Ajustes de la aplicación" },
    { id: "appearance", label: "Apariencia" },
    { id: "voice", label: "Voz y video" },
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
      {section === "decorations" && <DecorationShop />}
      {section === "privacy" && <Privacy />}
      {section === "problems" && <ProblemsSettings />}
      {section === "accounts" && owner && <AccountsRegistry />}
      {section === "premium" && <PremiumSettings />}
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
  const [askDelete, setAskDelete] = useState(false);
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
          const problem = passwordStrength(pass, email).problem;
          if (problem) return toast(problem, "error");
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
          <PasswordMeter pass={pass} email={email} />
        </label>
        <label className="field">
          <span>Repetila</span>
          <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy || !pass}>
          Cambiar contraseña
        </button>
      </form>
      <hr className="settings-hr" />
      <TwoFactor />
      <hr className="settings-hr" />
      <Sessions />
      <hr className="settings-hr" />
      <SecurityActivity />
      {me.id !== "e7809edc-8559-4df6-8d2b-1fffc7a27719" && (
        <>
          <hr className="settings-hr" />
          <h2>Eliminar cuenta</h2>
          <p className="hint">Se borra tu perfil y salís de todos los servidores. No se puede deshacer.</p>
          <button className="btn danger" onClick={() => setAskDelete(true)}>
            Eliminar cuenta
          </button>
          {askDelete && <DeleteAccountDialog onClose={() => setAskDelete(false)} />}
        </>
      )}
    </>
  );
}

/** Verificación en dos pasos con una app autenticadora (Google Authenticator, Authy, 1Password…). */
function TwoFactor() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined); // undefined = cargando
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return fail(error);
    setFactorId(data.totp.find((f) => f.status === "verified")?.id ?? null);
  };
  useEffect(() => void load(), []);

  const start = async () => {
    setBusy(true);
    try {
      // un intento anterior sin terminar deja un factor sin verificar: lo sacamos para empezar de cero
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Fogón" });
      if (error) throw error;
      setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code });
    setBusy(false);
    if (error) return toast("El código no es correcto. Probá con el que aparece ahora en la app.", "error");
    setSetup(null);
    toast("🔐 Activaste la verificación en dos pasos");
    void load();
  };

  const disable = async () => {
    if (!factorId || !confirm_("¿Desactivar la verificación en dos pasos? Tu cuenta va a quedar protegida solo con la contraseña.")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) return toast(friendlyError(error), "error");
    toast("Desactivaste la verificación en dos pasos");
    void load();
  };

  return (
    <>
      <h2>Verificación en dos pasos</h2>
      <p className="hint">Además de la contraseña, al entrar te pedimos un código de tu app autenticadora. Si alguien te roba la contraseña, igual no puede entrar.</p>
      {factorId === undefined ? null : factorId ? (
        <div className="mfa-on">
          <span className="mfa-badge">✅ Activada</span>
          <button className="btn danger" disabled={busy} onClick={() => void disable()}>
            Desactivar
          </button>
        </div>
      ) : setup ? (
        <form className="pass-form" onSubmit={confirm}>
          <ol className="mfa-steps">
            <li>Escaneá este código con tu app autenticadora (Google Authenticator, Authy, 1Password…).</li>
            <li>Poné el código de 6 dígitos que te muestra.</li>
          </ol>
          <img className="mfa-qr" src={setup.qr} alt="Código QR para la app autenticadora" width={180} height={180} />
          <p className="hint">
            ¿No podés escanear? Cargá esta clave a mano: <code className="mfa-secret">{setup.secret}</code>
          </p>
          <label className="field">
            <span>Código</span>
            <input className="input mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy || code.length !== 6}>
              Activar
            </button>
            <button type="button" className="btn ghost" onClick={() => setSetup(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button className="btn primary" disabled={busy} onClick={() => void start()}>
          Activar verificación en dos pasos
        </button>
      )}
    </>
  );
}

function confirm_(text: string) {
  return typeof window !== "undefined" && window.confirm(text);
}

function Sessions() {
  const [list, setList] = useState<MySession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    mySessions()
      .then(setList)
      .catch((e) => toast(friendlyError(e), "error"));
  useEffect(() => void load(), []);
  const others = (list ?? []).filter((x) => !x.current);
  const when = (d: string) => new Date(d).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <h2>Dispositivos</h2>
      <p className="hint">Estos son los lugares donde tu cuenta tiene la sesión abierta. Si ves uno que no reconocés, cerralo y cambiá tu contraseña.</p>
      <ul className="sess-list">
        {(list ?? []).map((x) => (
          <li key={x.id} className="sess">
            <div>
              <b>
                {deviceName(x.user_agent)}
                {x.current && <span className="sess-here"> · Este dispositivo</span>}
              </b>
              <small>
                {x.ip ? `${x.ip} · ` : ""}Última actividad: {when(x.last_seen)}
                {x.aal === "aal2" ? " · 🔐 con dos pasos" : ""}
              </small>
            </div>
            {!x.current && (
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await endSession(x.id);
                    toast("Cerraste esa sesión");
                    await load();
                  } catch (e) {
                    toast(friendlyError(e), "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cerrar
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm_(`¿Cerrar la sesión en los otros ${others.length} dispositivos?`)) return;
            setBusy(true);
            try {
              await endOtherSessions();
              toast("Cerraste la sesión en todos los demás dispositivos");
              await load();
            } catch (e) {
              toast(friendlyError(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Cerrar sesión en todos los demás
        </button>
      )}
    </>
  );
}

const EVENT_TEXT: Record<SecurityEvent["kind"], string> = {
  login: "Inicio de sesión",
  mfa_on: "Activaste la verificación en dos pasos",
  mfa_off: "Desactivaste la verificación en dos pasos",
  password: "Cambió la contraseña",
  email: "Cambió el email",
};

function SecurityActivity() {
  const [list, setList] = useState<SecurityEvent[] | null>(null);
  useEffect(() => {
    securityLog()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  const when = (d: string) => new Date(d).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      <h2>Actividad de seguridad</h2>
      <p className="hint">Lo último que pasó con tu cuenta. Si algo no lo hiciste vos, cambiá la contraseña y cerrá las sesiones que no reconozcas.</p>
      {list && list.length === 0 && <p className="hint">Todavía no hay actividad registrada.</p>}
      <ul className="sess-list">
        {(list ?? []).map((e) => (
          <li key={e.id} className="sess">
            <div>
              <b>
                {EVENT_TEXT[e.kind]}
                {e.kind === "login" && ` · ${deviceName(e.user_agent)}`}
              </b>
              <small>
                {e.ip ? `${e.ip} · ` : ""}
                {when(e.created_at)}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me)!;
  const servers = useStore((s) => s.servers);
  const ownsServers = Object.values(servers).filter((x) => x.owner_id === me.id).map((x) => x.name);
  const [pass, setPass] = useState("");
  const [sure, setSure] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = sure.trim().toLowerCase() === me.username.toLowerCase() && pass.length >= 6;
  return (
    <Modal label="Eliminar cuenta" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setErr("");
          try {
            await deleteMyAccount(pass);
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>Eliminar tu cuenta</h2>
        <div className="del-warn">
          <b>⚠️ Esto no se puede deshacer.</b>
          <ul>
            <li>Tu perfil, amigos, insignias y Premium se borran.</li>
            <li>Salís de todos los servidores.</li>
            <li>Tus mensajes quedan, pero firmados como «Usuario eliminado».</li>
            {ownsServers.length > 0 && <li>Tus servidores ({ownsServers.join(", ")}) pasan a la persona de más rango; si no queda nadie, se borran.</li>}
          </ul>
        </div>
        <label className="field">
          <span>Escribí tu usuario ({me.username}) para confirmar</span>
          <input className="input" value={sure} onChange={(e) => setSure(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Tu contraseña</span>
          <input className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
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
          <button className="btn danger" disabled={!ok || busy}>
            {busy ? "Eliminando…" : "Eliminar mi cuenta"}
          </button>
        </div>
      </form>
    </Modal>
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

/* ---------- Decoraciones de avatar (gratis, como la tienda de Discord) ---------- */

function DecorationShop() {
  const me = useStore((s) => s.me)!;
  const [pick, setPick] = useState<AvatarDeco | null>((me.avatar_deco as AvatarDeco) ?? null);
  const [busy, setBusy] = useState(false);
  const current = (me.avatar_deco as AvatarDeco) ?? null;
  const save = async (id: AvatarDeco | null) => {
    setBusy(true);
    try {
      await updateProfile({ avatar_deco: id });
      toast(id ? `🎁 Te pusiste «${decoLabel(id)}»` : "Sacaste la decoración");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h1>Decoraciones</h1>
      <div className="deco-hero">
        <div>
          <b>🎁 Decoraciones de avatar</b>
          <p>Un marco alrededor de tu foto que ven todos: en el chat, en la lista de miembros y en tu perfil. Todas son <b>gratis</b>.</p>
        </div>
      </div>
      <div className="deco-layout">
        <div className="deco-shop">
          {DECO_COLLECTIONS.map((c) => (
            <section key={c.id} className="deco-col">
              <h3 className="settings-sub">
                {c.title} <small>{c.desc}</small>
              </h3>
              <div className="deco-grid">
                {c.items.map((d) => (
                  <button key={d.id} type="button" className={`deco-card${pick === d.id ? " on" : ""}`} onClick={() => setPick(d.id)} aria-pressed={pick === d.id}>
                    <span className="deco-stage">
                      <Avatar p={{ ...me, avatar_deco: d.id }} size="lg" />
                    </span>
                    <span className="deco-name">{d.label}</span>
                    <span className={`deco-price${current === d.id ? " using" : ""}`}>{current === d.id ? "En uso" : "Gratis"}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="deco-preview">
          <h3 className="settings-sub">Vista previa</h3>
          <div className="deco-preview-card">
            <Avatar p={{ ...me, avatar_deco: pick }} size="xl" />
            <b>{me.display_name}</b>
            <span className="hint">{pick ? decoLabel(pick) : "Sin decoración"}</span>
            <div className="deco-preview-small">
              <Avatar p={{ ...me, avatar_deco: pick }} size="sm" />
              <span>Así se ve en el chat</span>
            </div>
          </div>
          <div className="deco-actions">
            <button className="btn primary" disabled={busy || pick === current} onClick={() => void save(pick)}>
              {pick === current ? "En uso" : pick ? "Usar decoración" : "Sacar decoración"}
            </button>
            {current && (
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  setPick(null);
                  void save(null);
                }}
              >
                Sacar la que tengo
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ---------- Fogón Premium ---------- */

const PERKS = [
  ["✨", "Nombre con estilo", "Degradé, brillo o arcoíris, con tus colores."],
  ["🎆", "Efectos de perfil", "Chispas, brasas, nieve y más cuando abren tu perfil."],
  ["🎨", "Temas de la app", "Cambiá los colores de todo Fogón y el color de acento."],
  ["💎", "Insignia Premium", "Para que todos sepan."],
] as const;

function PremiumSettings() {
  const me = useStore((s) => s.me)!;
  const [draft, setDraft] = useState<ProfilePatch>({});
  const [busy, setBusy] = useState(false);
  const view: Profile = { ...me, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const set = (patch: ProfilePatch) => setDraft((d) => ({ ...d, ...patch }));

  // el tema se ve al toque; si no guardás, vuelve el que tenías
  useEffect(() => {
    applyAppTheme(view);
  }, [view.app_theme, view.app_accent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => applyAppTheme(getState().me), []);

  if (!me.premium) {
    return (
      <>
        <h1>Fogón Premium</h1>
        <div className="prem-hero">
          <b>💎 Fogón Premium</b>
          <p>Tuneá Fogón a tu gusto.</p>
        </div>
        <div className="prem-perks">
          {PERKS.map(([i, t, d]) => (
            <div key={t}>
              <span>{i}</span>
              <b>{t}</b>
              <p className="hint">{d}</p>
            </div>
          ))}
        </div>
        <p className="hint">Todavía no tenés Premium. Por ahora lo da el equipo de Fogón.</p>
      </>
    );
  }

  return (
    <>
      <h1>Fogón Premium</h1>
      <div className="prem-hero on">
        <b>💎 Tenés Fogón Premium</b>
        <p>Todo lo de acá lo ven los demás (menos el tema de la app, que es tuyo).</p>
      </div>
      <div className="prem-grid">
        <div className="prem-controls">
          <h3 className="settings-sub">Estilo del nombre</h3>
          <div className="chips" role="radiogroup" aria-label="Estilo del nombre">
            <button type="button" role="radio" aria-checked={!view.name_style} className={!view.name_style ? "on" : ""} onClick={() => set({ name_style: null })}>
              Normal
            </button>
            {NAME_STYLES.map((n) => (
              <button key={n.id} type="button" role="radio" aria-checked={view.name_style === n.id} className={view.name_style === n.id ? "on" : ""} onClick={() => set({ name_style: n.id })}>
                {n.label}
              </button>
            ))}
          </div>
          {view.name_style && view.name_style !== "arcoiris" && (
            <div className="prem-colors">
              <label>
                Color 1 <input type="color" value={view.name_c1 || view.color} onChange={(e) => set({ name_c1: e.target.value })} />
              </label>
              {view.name_style === "gradiente" && (
                <label>
                  Color 2 <input type="color" value={view.name_c2 || "#ffffff"} onChange={(e) => set({ name_c2: e.target.value })} />
                </label>
              )}
            </div>
          )}

          <h3 className="settings-sub">Efecto del perfil</h3>
          <div className="prem-tiles fx">
            <button type="button" className={!view.profile_effect ? "on" : ""} onClick={() => set({ profile_effect: null })}>
              <span className="fx-sample" />
              <span>Ninguno</span>
            </button>
            {EFFECTS.map((f) => (
              <button key={f.id} type="button" className={view.profile_effect === f.id ? "on" : ""} onClick={() => set({ profile_effect: f.id })}>
                <span className="fx-sample">
                  <span className={`pv-effect fx-${f.id}`} />
                </span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>

          <h3 className="settings-sub">Tema de la app</h3>
          <div className="prem-themes">
            <button type="button" className={!view.app_theme ? "on" : ""} onClick={() => set({ app_theme: null })} title="Predeterminado">
              <span className="sw" style={{ background: "linear-gradient(135deg, #1e1f22, #313338)" }} />
              <span>Clásico</span>
            </button>
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={view.app_theme === t.id ? "on" : ""} onClick={() => set({ app_theme: t.id })}>
                <span className="sw" style={{ background: `${t.grad}, linear-gradient(135deg, ${t.rail}, ${t.chat})`, boxShadow: `inset 0 -6px 0 ${t.accent}` }} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="prem-colors">
            <label>
              Color de acento <input type="color" value={view.app_accent || THEMES.find((t) => t.id === view.app_theme)?.accent || "#5865f2"} onChange={(e) => set({ app_accent: e.target.value })} />
            </label>
            {view.app_accent && (
              <button type="button" className="link-btn" onClick={() => set({ app_accent: null })}>
                Usar el del tema
              </button>
            )}
          </div>
        </div>
        <div className="prem-preview">
          <h3 className="settings-sub">Vista previa</h3>
          <ProfileView p={view} variant="preview" />
        </div>
      </div>
      {dirty && (
        <div className="save-bar">
          <span>¡Cuidado! Tenés cambios sin guardar.</span>
          <button className="link-btn" onClick={() => setDraft({})}>
            Restablecer
          </button>
          <button
            className="btn"
            style={{ background: "#248046", color: "#fff" }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await updateProfile(draft);
                setDraft({});
                toast("Listo, guardado ✨");
              } catch (e) {
                fail(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Guardar cambios
          </button>
        </div>
      )}
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
      <h1>Voz y video</h1>
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
      <hr className="settings-hr" />
      <CameraSettings />
    </>
  );
}

/** Cámara: elegir cuál usar, verla en vivo y si se muestra en espejo. Queda guardado en este dispositivo. */
function CameraSettings() {
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState(() => readPref("fogon:camera", ""));
  const [mirror, setMirror] = useState(() => readPref("fogon:cameraMirror", "1") === "1");
  const [quality, setQuality] = useState(() => readPref("fogon:cameraQuality", "720"));
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [err, setErr] = useState("");
  const video = useRef<HTMLVideoElement>(null);

  const listCams = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCams(all.filter((d) => d.kind === "videoinput"));
    } catch {}
  };
  useEffect(() => {
    void listCams();
  }, []);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const start = async (id = camId, q = quality) => {
    setErr("");
    stream?.getTracks().forEach((t) => t.stop());
    try {
      const h = Number(q);
      const s = await navigator.mediaDevices.getUserMedia({
        video: { ...(id ? { deviceId: { exact: id } } : {}), height: { ideal: h }, width: { ideal: Math.round((h * 16) / 9) } },
        audio: false,
      });
      setStream(s);
      void listCams(); // con permiso ya se ven los nombres de las cámaras
    } catch (e) {
      const n = (e as Error)?.name;
      setStream(null);
      setErr(n === "NotAllowedError" ? "Fogón no tiene permiso para usar tu cámara. Habilitalo en el candadito de la barra de direcciones." : n === "NotFoundError" || n === "OverconstrainedError" ? "No encontramos esa cámara. ¿Está conectada?" : "No pudimos abrir la cámara (¿la está usando otra app?).");
    }
  };
  const save = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  return (
    <>
      <h3 className="settings-sub">Cámara</h3>
      <div className="cam-box">
        <div className={`cam-preview${mirror ? " mirror" : ""}`}>
          {stream ? (
            <video ref={video} autoPlay playsInline muted />
          ) : (
            <div className="cam-off">
              <span>📷</span>
              <p>{err || "Probá tu cámara para ver cómo te ven."}</p>
            </div>
          )}
        </div>
        <div className="cam-controls">
          <label className="field">
            <span>Cámara</span>
            <select
              className="input"
              value={camId}
              onChange={(e) => {
                setCamId(e.target.value);
                save("fogon:camera", e.target.value);
                if (stream) void start(e.target.value);
              }}
            >
              <option value="">La predeterminada</option>
              {cams.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                  {c.label || `Cámara ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Calidad</span>
            <select
              className="input"
              value={quality}
              onChange={(e) => {
                setQuality(e.target.value);
                save("fogon:cameraQuality", e.target.value);
                if (stream) void start(camId, e.target.value);
              }}
            >
              <option value="360">Baja (360p) · menos datos</option>
              <option value="720">Buena (720p)</option>
              <option value="1080">Alta (1080p)</option>
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => {
                setMirror(e.target.checked);
                save("fogon:cameraMirror", e.target.checked ? "1" : "0");
              }}
            />
            Verme en espejo (los demás te ven al derecho)
          </label>
          <button className={`btn ${stream ? "" : "primary"}`} onClick={() => (stream ? setStream(null) : void start())}>
            {stream ? "Apagar cámara" : "Probar cámara"}
          </button>
        </div>
      </div>
    </>
  );
}

function readPref(k: string, d: string) {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
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
    { id: "emojis", label: "Emojis" },
    { group: "Gestión de miembros" },
    { id: "invites", label: "Invitaciones" },
    ...(can(st, server.id, "ban_members") ? [{ id: "bans", label: "Baneos" }] : []),
    ...(can(st, server.id, "view_audit_log") ? [{ id: "audit", label: "Registro de auditoría" }] : []),
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
      {active === "audit" && (
        <>
          <h1>Registro de auditoría</h1>
          <AuditLog server={server} />
        </>
      )}
      {active === "emojis" && (
        <>
          <h1>Emojis</h1>
          <EmojiSettings server={server} />
        </>
      )}
    </SettingsShell>
  );
}
