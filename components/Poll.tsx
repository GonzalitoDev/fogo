"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/chat";
import { can, createPoll, endPoll, toast, useStore, votePoll } from "@/lib/store";
import type { Poll } from "@/lib/types";
import { Icon } from "./Icon";
import { EmojiText } from "./Emoji";
import { EmojiPicker, Modal } from "./ui";

const DURATIONS: { h: number; label: string }[] = [
  { h: 1, label: "1 hora" },
  { h: 4, label: "4 horas" },
  { h: 8, label: "8 horas" },
  { h: 24, label: "24 horas" },
  { h: 72, label: "3 días" },
  { h: 168, label: "1 semana" },
  { h: 336, label: "2 semanas" },
];

function leftText(ends: string, now: number) {
  const ms = new Date(ends).getTime() - now;
  if (ms <= 0) return "Terminó";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `Quedan ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `Quedan ${h} h`;
  return `Quedan ${Math.round(h / 24)} días`;
}

/** Encuesta dentro de un mensaje: votás tocando las respuestas y ves los resultados en vivo. */
export function PollCard({ poll, authorId, canVote, serverId }: { poll: Poll; authorId: string; canVote: boolean; serverId: string | null }) {
  const me = useStore((s) => s.me?.id ?? "");
  const votes = useStore((s) => s.pollVotes[poll.message_id]) ?? [];
  const profiles = useStore((s) => s.profiles);
  const canManage = useStore((s) => (serverId ? can(s, serverId, "manage_messages") : false));
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState<number[] | null>(null); // selección en curso (varias respuestas)
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const ended = new Date(poll.ends_at).getTime() <= now;
  const mine = votes.filter((v) => v.user_id === me).map((v) => v.option_id);
  const voted = mine.length > 0;
  const showResults = ended || voted;
  const voters = new Set(votes.map((v) => v.user_id)).size;
  const count = (id: number) => votes.filter((v) => v.option_id === id).length;
  const max = Math.max(0, ...poll.options.map((o) => count(o.id)));
  const selected = pick ?? mine;

  const send = async (ids: number[]) => {
    setBusy(true);
    try {
      await votePoll(poll.message_id, ids);
      setPick(null);
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const tap = (id: number) => {
    if (ended || !canVote || busy) return;
    if (!poll.multi) return void send(mine.includes(id) ? [] : [id]);
    const cur = pick ?? mine;
    setPick(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const dirty = pick !== null && (pick.length !== mine.length || pick.some((x) => !mine.includes(x)));

  return (
    <div className={"poll" + (ended ? " ended" : "")} role="group" aria-label={`Encuesta: ${poll.question}`}>
      <div className="poll-q">{poll.question}</div>
      <div className="poll-sub">{ended ? "Encuesta terminada" : poll.multi ? "Elegí una o más respuestas" : "Elegí una respuesta"}</div>
      <div className="poll-opts">
        {poll.options.map((o) => {
          const n = count(o.id);
          const pct = voters ? Math.round((n / voters) * 100) : 0;
          const on = selected.includes(o.id);
          const win = ended && n > 0 && n === max;
          const who = votes.filter((v) => v.option_id === o.id).map((v) => profiles[v.user_id]?.display_name ?? "alguien");
          return (
            <button
              key={o.id}
              className={"poll-opt" + (on ? " on" : "") + (win ? " win" : "")}
              onClick={() => tap(o.id)}
              disabled={ended || !canVote}
              role={poll.multi ? "checkbox" : "radio"}
              aria-checked={on}
              title={showResults && who.length ? who.slice(0, 15).join(", ") + (who.length > 15 ? "…" : "") : undefined}
            >
              {showResults && <span className="poll-bar" style={{ width: `${pct}%` }} aria-hidden />}
              <span className="poll-mark" aria-hidden>
                {on ? "●" : "○"}
              </span>
              {o.emoji && (
                <span className="poll-emoji">
                  <EmojiText e={o.emoji} size={20} />
                </span>
              )}
              <span className="poll-text">{o.text}</span>
              {showResults && (
                <span className="poll-n">
                  {n} · {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="poll-foot">
        <span>
          {voters} {voters === 1 ? "voto" : "votos"} · {leftText(poll.ends_at, now)}
        </span>
        {poll.multi && dirty && !ended && (
          <button className="btn primary sm" disabled={busy} onClick={() => void send(pick!)}>
            Votar
          </button>
        )}
        {voted && !ended && canVote && (
          <button className="linkish" disabled={busy} onClick={() => void send([])}>
            Sacar voto
          </button>
        )}
        {!ended && (authorId === me || canManage) && (
          <button className="linkish" onClick={() => void endPoll(poll.message_id).catch((e) => toast(friendlyError(e), "error"))}>
            Terminar ahora
          </button>
        )}
      </div>
    </div>
  );
}

/** Crear una encuesta (botón 📊 del composer). */
export function PollDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ text: string; emoji: string }[]>([
    { text: "", emoji: "" },
    { text: "", emoji: "" },
  ]);
  const [hours, setHours] = useState(24);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [emojiFor, setEmojiFor] = useState<{ i: number; x: number; y: number } | null>(null);
  const filled = opts.filter((o) => o.text.trim()).length;

  const set = (i: number, patch: Partial<{ text: string; emoji: string }>) => setOpts((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <Modal label="Crear encuesta" onClose={onClose}>
      <form
        className="poll-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          if (!q.trim()) return setErr("Escribí la pregunta.");
          if (filled < 2) return setErr("Poné al menos 2 respuestas.");
          setBusy(true);
          try {
            await createPoll(channelId, q, opts.filter((o) => o.text.trim()).map((o) => ({ text: o.text, emoji: o.emoji || undefined })), multi, hours);
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2>
          <Icon name="poll" /> Crear encuesta
        </h2>
        <label className="field">
          <span>Pregunta</span>
          <input className="input" autoFocus maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Qué jugamos esta noche?" />
        </label>
        <div className="field">
          <span>Respuestas</span>
          <div className="poll-edit">
            {opts.map((o, i) => (
              <div key={i} className="poll-edit-row">
                <button
                  type="button"
                  className="poll-emoji-btn"
                  aria-label={o.emoji ? `Emoji ${o.emoji}, cambiar` : "Ponerle un emoji"}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setEmojiFor({ i, x: r.right, y: r.top });
                  }}
                >
                  {o.emoji ? <EmojiText e={o.emoji} size={20} /> : <Icon name="smile" />}
                </button>
                <input className="input" maxLength={55} value={o.text} onChange={(e) => set(i, { text: e.target.value })} placeholder={`Respuesta ${i + 1}`} aria-label={`Respuesta ${i + 1}`} />
                {opts.length > 2 && (
                  <button type="button" className="icon-btn" aria-label={`Sacar respuesta ${i + 1}`} onClick={() => setOpts((l) => l.filter((_, j) => j !== i))}>
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            ))}
            {opts.length < 10 && (
              <button type="button" className="btn ghost" onClick={() => setOpts((l) => [...l, { text: "", emoji: "" }])}>
                <Icon name="plus" /> Agregar respuesta
              </button>
            )}
          </div>
        </div>
        <div className="poll-form-row">
          <label className="field">
            <span>Duración</span>
            <select className="input" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d.h} value={d.h}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Permitir varias respuestas
          </label>
        </div>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <div className="foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>
      {emojiFor && <EmojiPicker at={{ x: emojiFor.x, y: emojiFor.y }} onPick={(e) => set(emojiFor.i, { emoji: e })} onClose={() => setEmojiFor(null)} />}
    </Modal>
  );
}
