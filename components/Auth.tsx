"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createProfile, getState, setState, signOut, toast, verifyMfa } from "@/lib/store";
import { friendlyError, usernameFromEmail } from "@/lib/chat";
import { emailTypo, forgetAccount, maskEmail, savedAccounts, switchTo, type SavedAccount } from "@/lib/accounts";
import { passwordStrength } from "@/lib/security";
import { Ember, Icon } from "./Icon";
import { Avatar, COLORS } from "./ui";

export function AuthScreen() {
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  useEffect(() => setSaved(savedAccounts()), []);
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<"" | "confirm" | "reset">("");
  const [typoOk, setTypoOk] = useState("");
  const typo = emailTypo(email);
  const showTypo = !!typo && typoOk !== email;
  const passRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    // al crear la cuenta, un email mal escrito (gmail.con) hace que después no puedas entrar
    if (mode !== "in" && showTypo) return setErr("Revisá el email: parece mal escrito.");
    if (mode === "up") {
      const problem = passwordStrength(pass, email).problem;
      if (problem) return setErr(problem);
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setSent("reset");
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pass, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
        if (error) throw error;
        // Supabase no avisa si el email ya existe: devuelve un usuario sin identidades
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode("in");
          setErr("Ya hay una cuenta con ese email. Entrá con tu contraseña.");
          return;
        }
        if (!data.session) {
          // las cuentas nuevas quedan confirmadas solas: entramos directo
          const r = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
          if (r.error) setSent("confirm");
        }
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (a: SavedAccount) => {
    setErr("");
    if (a.refresh_token) {
      setBusy(true);
      const ok = await switchTo(a.id);
      setBusy(false);
      if (ok) return;
      setSaved(savedAccounts());
      setErr(`La sesión de @${a.username ?? "esa cuenta"} venció. Poné tu contraseña para entrar.`);
    }
    setMode("in");
    setEmail(a.email);
    setTimeout(() => passRef.current?.focus(), 0);
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">
            <Ember />
          </span>
          <h1>Fogón</h1>
        </div>
        {sent ? (
          <>
            <h2>Revisá tu email</h2>
            <p className="hint" style={{ fontSize: 15 }}>
              {sent === "reset" ? (
                <>
                  Si hay una cuenta con <b>{email}</b>, te mandamos un link para elegir una contraseña nueva. Revisá también la carpeta de spam.
                </>
              ) : (
                <>
                  Te mandamos un link a <b>{email}</b>. Abrilo para confirmar tu cuenta y volvés directo acá.
                </>
              )}
            </p>
            <button
              className="btn ghost"
              onClick={() => {
                setSent("");
                setMode("in");
              }}
            >
              Volver
            </button>
          </>
        ) : (
          <>
            {saved.length > 0 && mode === "in" && (
              <div className="saved-accs">
                <span className="saved-title">Cuentas guardadas en este dispositivo</span>
                {saved.map((a) => (
                  <div key={a.id} className="saved-acc">
                    <button type="button" className="saved-pick" disabled={busy} onClick={() => void pick(a)}>
                      <Avatar p={{ id: a.id, username: a.username ?? "", display_name: a.display_name ?? a.email, color: a.color ?? "#6b7b77", avatar_path: a.avatar_path }} size="sm" />
                      <span className="saved-names">
                        <b>{a.display_name ?? a.email.split("@")[0]}</b>
                        <small>
                          {a.username ? `@${a.username} · ` : ""}
                          {maskEmail(a.email)}
                        </small>
                      </span>
                      <span className="saved-go">{a.refresh_token ? "Entrar" : "Contraseña"}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Sacar ${a.display_name ?? a.email} de este dispositivo`}
                      title="Sacar de este dispositivo"
                      onClick={() => {
                        forgetAccount(a.id);
                        setSaved(savedAccounts());
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                ))}
                <span className="saved-or">o entrá con otra cuenta</span>
              </div>
            )}
            <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
              {mode !== "reset" ? (
                <div className="tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={mode === "in"} onClick={() => setMode("in")}>
                    Entrar
                  </button>
                  <button type="button" role="tab" aria-selected={mode === "up"} onClick={() => setMode("up")}>
                    Crear cuenta
                  </button>
                </div>
              ) : (
                <div>
                  <h2 style={{ margin: 0 }}>Recuperar contraseña</h2>
                  <p className="hint">Poné el email de tu cuenta y te mandamos un link para elegir una contraseña nueva.</p>
                </div>
              )}
              <label className="field">
                <span>Email</span>
                <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                {showTypo && (
                  <span className="email-typo" role="status">
                    ¿Quisiste decir <b>{typo}</b>?{" "}
                    <button type="button" className="link-btn" onClick={() => setEmail(typo!)}>
                      Sí, corregir
                    </button>
                    {" · "}
                    <button type="button" className="link-btn" onClick={() => setTypoOk(email)}>
                      No, está bien
                    </button>
                  </span>
                )}
              </label>
              {mode !== "reset" && (
                <label className="field">
                  <span>Contraseña</span>
                  <input
                    id="password"
                    ref={passRef}
                    className="input"
                    type="password"
                    autoComplete={mode === "in" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "in" ? 6 : 8}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                  {mode === "up" && <PasswordMeter pass={pass} email={email} />}
                  {mode === "in" && (
                    <button type="button" className="link-btn forgot" onClick={() => setMode("reset")}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </label>
              )}
              {err && (
                <div className="err" role="alert">
                  {err}
                </div>
              )}
              <button className="btn primary" disabled={busy} style={{ height: 44 }}>
                {busy ? "Un momento…" : mode === "in" ? "Entrar" : mode === "up" ? "Crear cuenta" : "Mandarme el link"}
              </button>
              {mode === "reset" && (
                <button type="button" className="btn ghost" onClick={() => setMode("in")}>
                  Volver
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </main>
  );
}

/** Barrita de fuerza de la contraseña, con el motivo si no se puede usar. */
export function PasswordMeter({ pass, email }: { pass: string; email?: string }) {
  if (!pass) return null;
  const s = passwordStrength(pass, email);
  return (
    <span className="pw-meter" data-score={s.score} role="status">
      <span className="pw-bar">
        <i style={{ width: `${s.score * 25}%` }} />
      </span>
      <small>{s.problem ?? s.label}</small>
    </span>
  );
}

/** Entró con el link de "olvidé mi contraseña": elige una nueva. */
export function NewPasswordScreen() {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <main className="auth">
      <form
        className="auth-card"
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = passwordStrength(pass, getState().session?.user.email).problem;
          if (problem) return setErr(problem);
          if (pass !== again) return setErr("Las contraseñas no coinciden.");
          setBusy(true);
          setErr("");
          const { error } = await supabase.auth.updateUser({ password: pass, data: { must_change_password: false } });
          setBusy(false);
          if (error) return setErr(friendlyError(error));
          setState({ recovery: false });
          toast("🔑 Listo, ya tenés contraseña nueva");
        }}
      >
        <h2 style={{ margin: 0 }}>Elegí una contraseña nueva</h2>
        <p className="hint" style={{ margin: 0 }}>Para cuidar tu cuenta, elegí una contraseña que solo sepas vos.</p>
        <label className="field">
          <span>Contraseña nueva</span>
          <input id="new-password" className="input" type="password" autoComplete="new-password" required minLength={8} value={pass} onChange={(e) => setPass(e.target.value)} />
          <PasswordMeter pass={pass} email={getState().session?.user.email} />
        </label>
        <label className="field">
          <span>Repetila</span>
          <input id="new-password-2" className="input" type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn primary" disabled={busy} style={{ height: 44 }}>
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}

/** Tiene verificación en dos pasos: pide el código de la app autenticadora antes de entrar. */
export function MfaScreen() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <main className="auth">
      <form
        className="auth-card"
        style={{ display: "grid", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await verifyMfa(code);
          } catch (e) {
            setErr(friendlyError(e));
            setCode("");
            setBusy(false);
          }
        }}
      >
        <h2 style={{ margin: 0 }}>Verificación en dos pasos</h2>
        <p className="hint" style={{ margin: 0 }}>Abrí tu app autenticadora y poné el código de 6 dígitos de Fogón.</p>
        <label className="field">
          <span>Código</span>
          <input
            id="mfa-code"
            className="input mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn primary" disabled={busy || code.length !== 6} style={{ height: 44 }}>
          {busy ? "Verificando…" : "Entrar"}
        </button>
        <button type="button" className="btn ghost" onClick={() => void signOut()}>
          Usar otra cuenta
        </button>
      </form>
    </main>
  );
}

export function ProfileSetup() {
  const email = getState().session?.user.email ?? "";
  const [username, setUsername] = useState(() => usernameFromEmail(email));
  const [name, setName] = useState(() => email.split("@")[0].slice(0, 40));
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = /^[a-z0-9_.]{2,32}$/.test(username) && name.trim().length > 0;

  return (
    <main className="auth">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          setErr("");
          try {
            await createProfile(username, name, color);
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>¿Cómo te van a ver?</h2>
        <label className="field">
          <span>Nombre de usuario</span>
          <input
            id="username"
            className="input"
            value={username}
            maxLength={32}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
            aria-describedby="username-hint"
          />
          <span id="username-hint" className="hint" style={{ fontWeight: 400 }}>
            Te mencionan con @{username || "usuario"}. Letras, números, punto y guion bajo.
          </span>
        </label>
        <label className="field">
          <span>Nombre visible</span>
          <input id="display-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="colors" role="radiogroup" aria-label="Color del avatar">
            {COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} className="color" style={{ ["--c" as string]: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button className="btn primary" disabled={!valid || busy} style={{ height: 44 }}>
          {busy ? "Guardando…" : "Entrar a Fogón"}
        </button>
        <button type="button" className="btn ghost" onClick={() => void supabase.auth.signOut()}>
          Usar otra cuenta
        </button>
      </form>
    </main>
  );
}
