"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/chat";
import { toast } from "@/lib/store";
import { Icon } from "./Icon";
import { Avatar, COLORS } from "./ui";

type Bot = { id: string; username: string; display_name: string; color: string; personality: string; enabled: boolean };

export function BotsSettings() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [color, setColor] = useState("#a78bfa");
  const [personality, setPersonality] = useState("");

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPersonality, setEditPersonality] = useState("");

  const load = async () => {
    const { data, error } = await supabase.rpc("fogon_list_bots");
    if (error) return setErr(friendlyError(error));
    setBots((data ?? []) as Bot[]);
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!name.trim()) return setErr("Poné un nombre para el bot.");
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.rpc("fogon_create_bot", {
        p_name: name.trim(),
        p_username: username.trim(),
        p_color: color,
        p_personality: personality.trim(),
      });
      if (error) throw error;
      setName("");
      setUsername("");
      setPersonality("");
      setCreating(false);
      toast(`Bot "${name.trim()}" creado ✨`);
      await load();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (b: Bot) => {
    const { error } = await supabase.rpc("fogon_update_bot", {
      p_id: b.id,
      p_name: b.display_name,
      p_personality: b.personality,
      p_enabled: !b.enabled,
    });
    if (error) return setErr(friendlyError(error));
    setBots((xs) => xs.map((x) => (x.id === b.id ? { ...x, enabled: !x.enabled } : x)));
  };

  const startEdit = (b: Bot) => {
    setEditing(b.id);
    setEditName(b.display_name);
    setEditPersonality(b.personality);
  };

  const saveEdit = async (b: Bot) => {
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase.rpc("fogon_update_bot", {
        p_id: b.id,
        p_name: editName.trim(),
        p_personality: editPersonality.trim(),
        p_enabled: b.enabled,
      });
      if (error) throw error;
      setEditing(null);
      await load();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: Bot) => {
    if (!window.confirm(`¿Borrar el bot "${b.display_name}"? Se borra para siempre.`)) return;
    const { error } = await supabase.rpc("fogon_delete_bot", { p_id: b.id });
    if (error) return setErr(friendlyError(error));
    toast(`Bot "${b.display_name}" borrado`);
    setBots((xs) => xs.filter((x) => x.id !== b.id));
  };

  return (
    <>
      <h1>Bots 🤖</h1>
      <p className="hint">
        Creá bots con su propia personalidad. Cuando alguien los menciona con <b>@nombre</b> en un canal, responden solos con IA. No hace falta programar nada.
      </p>

      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}

      {!creating ? (
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Crear bot
        </button>
      ) : (
        <form
          style={{ display: "grid", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <span>Nombre</span>
              <input className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Boti" autoFocus />
            </label>
            <label className="field">
              <span>Usuario (sin @)</span>
              <input className="input" value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="boti" />
            </label>
          </div>
          <div className="field">
            <span>Color</span>
            <div className="colors" role="radiogroup" aria-label="Color del bot">
              {COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={c === color} aria-label={c} className="color" style={{ ["--c" as string]: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <label className="field">
            <span>Personalidad (así responde con IA)</span>
            <textarea
              className="input"
              rows={3}
              maxLength={1000}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Ej.: Sos un bot gracioso que cuenta chistes y usa muchos emojis. Hablás en minúscula y con onda."
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" disabled={busy || !name.trim()}>
              {busy ? "Creando…" : "Crear"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {bots.length === 0 && !creating ? (
        <p className="hint">Todavía no creaste ningún bot. Tocá "Crear bot" para arrancar.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {bots.map((b) => (
            <div key={b.id} style={{ display: "grid", gap: 10, padding: 12, background: "var(--raise)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar p={{ id: b.id, username: b.username, display_name: b.display_name, color: b.color }} size="md" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <b>{b.display_name}</b>
                    <span className="hint" style={{ margin: 0 }}>
                      @{b.username}
                    </span>
                  </div>
                  <p className="hint" style={{ margin: "2px 0 0", fontSize: 13 }}>
                    {b.personality || "Sin personalidad definida (responde genérico)."}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <label className="switch" title={b.enabled ? "Apagar bot" : "Prender bot"}>
                    <input type="checkbox" checked={b.enabled} onChange={() => void toggle(b)} />
                    <span />
                  </label>
                  <button className="icon-btn" title="Editar" onClick={() => (editing === b.id ? setEditing(null) : startEdit(b))}>
                    <Icon name="edit" />
                  </button>
                  <button className="icon-btn" title="Borrar" style={{ color: "var(--danger)" }} onClick={() => void remove(b)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>

              {editing === b.id && (
                <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <label className="field">
                    <span>Nombre</span>
                    <input className="input" value={editName} maxLength={32} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Personalidad</span>
                    <textarea className="input" rows={3} maxLength={1000} value={editPersonality} onChange={(e) => setEditPersonality(e.target.value)} />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn primary" disabled={busy} onClick={() => void saveEdit(b)}>
                      Guardar
                    </button>
                    <button className="btn ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
