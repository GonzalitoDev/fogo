"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { createProfile, getState } from "@/lib/store";
import { friendlyError, usernameFromEmail } from "@/lib/chat";
import { Ember } from "./Icon";
import { COLORS } from "./ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname + location.search } });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
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
              Te mandamos un link a <b>{email}</b>. Abrilo para confirmar tu cuenta y volvés directo acá.
            </p>
            <button className="btn ghost" onClick={() => setSent(false)}>
              Volver
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "in"} onClick={() => setMode("in")}>
                Entrar
              </button>
              <button type="button" role="tab" aria-selected={mode === "up"} onClick={() => setMode("up")}>
                Crear cuenta
              </button>
            </div>
            <label className="field">
              <span>Email</span>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </label>
            {err && (
              <div className="err" role="alert">
                {err}
              </div>
            )}
            <button className="btn primary" disabled={busy} style={{ height: 44 }}>
              {busy ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        )}
      </div>
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
