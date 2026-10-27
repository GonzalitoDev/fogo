"use client";

import { useEffect, useRef, useState } from "react";
import { friendlyError } from "@/lib/chat";
import {
  FOGON_OWNER,
  loadProblemMsgs,
  loadProblems,
  replyProblem,
  reportProblem,
  seenProblem,
  setProblemStatus,
  toast,
  useStore,
  type Problem,
  type ProblemKind,
  type ProblemMsg,
  type ProblemStatus,
} from "@/lib/store";
import { Avatar } from "./ui";

const KIND: Record<ProblemKind, string> = {
  bug: "🐛 Algo no anda",
  security: "🔐 Seguridad",
  account: "👤 Mi cuenta",
  idea: "💡 Idea o pedido",
  other: "💬 Otro",
};
const STATUS: Record<ProblemStatus, string> = { open: "Nuevo", seen: "Visto", fixed: "Solucionado", closed: "Cerrado" };

const when = (d: string) => new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

/** Ajustes → Problemas: reportar algo a Gonza y seguir la charla. Gonza ve la bandeja de todos. */
export function ProblemsSettings() {
  const me = useStore((s) => s.me)!;
  const ping = useStore((s) => s.problemPing);
  const owner = me.id === FOGON_OWNER;
  const [list, setList] = useState<Problem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const reload = () =>
    loadProblems()
      .then(setList)
      .catch((e) => toast(friendlyError(e), "error"));
  useEffect(() => void reload(), [ping]);

  const current = list?.find((p) => p.id === open);
  if (current) return <ProblemThread problem={current} owner={owner} onBack={() => setOpen(null)} onChange={reload} />;

  const shown = (list ?? []).filter((p) => filter === "all" || p.status === "open" || p.status === "seen");
  return (
    <>
      <h1>{owner ? "Bandeja de problemas" : "Problemas"}</h1>
      <p className="hint">
        {owner
          ? "Acá te llegan los problemas que reporta la gente. Contestales y marcá cuándo quedan solucionados."
          : "¿Algo no anda, viste algo raro con tu cuenta o tenés una idea? Contáselo a Gonza, el creador de Fogón. Te contesta acá mismo y te avisamos cuando lo haga."}
      </p>
      {writing ? (
        <ProblemForm
          onDone={(id) => {
            setWriting(false);
            void reload().then(() => setOpen(id));
          }}
          onCancel={() => setWriting(false)}
        />
      ) : (
        !owner && (
          <button className="btn primary" onClick={() => setWriting(true)}>
            Reportar un problema
          </button>
        )
      )}
      <div className="prob-head">
        <h2>{owner ? "Reportes" : "Mis reportes"}</h2>
        <div className="support-chips">
          <button className={`tag-chip${filter === "active" ? " on" : ""}`} onClick={() => setFilter("active")}>
            Abiertos
          </button>
          <button className={`tag-chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>
            Todos
          </button>
        </div>
      </div>
      {list && shown.length === 0 && <p className="hint">{owner ? "No hay problemas abiertos. 🎉" : "No tenés reportes abiertos."}</p>}
      <ul className="sess-list prob-list">
        {shown.map((p) => (
          <ProblemRow key={p.id} p={p} owner={owner} onOpen={() => setOpen(p.id)} />
        ))}
      </ul>
    </>
  );
}

function ProblemRow({ p, owner, onOpen }: { p: Problem; owner: boolean; onOpen: () => void }) {
  const who = useStore((s) => s.profiles[p.user_id]);
  const unread = owner ? p.unread_owner : p.unread_user;
  return (
    <li>
      <button className={`sess prob-row${unread ? " unread" : ""}`} onClick={onOpen}>
        {owner && <Avatar p={who} size="sm" />}
        <div>
          <b>
            {unread && <span className="prob-dot" aria-label="Nuevo" />}
            {p.title}
          </b>
          <small>
            {KIND[p.kind]} · {owner && who ? `@${who.username} · ` : ""}
            {when(p.updated_at)}
          </small>
        </div>
        <span className={`prob-status st-${p.status}`}>{STATUS[p.status]}</span>
      </button>
    </li>
  );
}

function ProblemForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<ProblemKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = title.trim().length >= 3 && body.trim().length >= 10;
  return (
    <form
      className="prob-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        setErr("");
        try {
          const id = await reportProblem(kind, title, body);
          toast("📨 Le mandaste el reporte a Gonza. Te avisamos cuando conteste.");
          onDone(id);
        } catch (e) {
          setErr(friendlyError(e));
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <span>¿De qué se trata?</span>
        <div className="support-chips" role="radiogroup" aria-label="Tipo de problema">
          {(Object.keys(KIND) as ProblemKind[]).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={kind === k} className={`tag-chip${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
              {KIND[k]}
            </button>
          ))}
        </div>
      </div>
      {kind === "security" && <p className="hint">Si creés que entraron a tu cuenta: cambiá la contraseña, cerrá las sesiones que no reconozcas en Mi cuenta y activá la verificación en dos pasos.</p>}
      <label className="field">
        <span>Título</span>
        <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: no puedo mandar imágenes en privado" autoFocus />
      </label>
      <label className="field">
        <span>Contá qué pasó</span>
        <textarea
          className="input"
          rows={5}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Qué estabas haciendo, qué esperabas que pasara y qué pasó. Si sale un error, copialo acá."
        />
      </label>
      <p className="hint">Junto con el reporte va tu dispositivo, el tamaño de la pantalla y el canal donde estabas, para que sea más fácil encontrar el problema. Nunca mandes tu contraseña.</p>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" disabled={!ok || busy}>
          {busy ? "Mandando…" : "Mandar a Gonza"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProblemThread({ problem: p, owner, onBack, onChange }: { problem: Problem; owner: boolean; onBack: () => void; onChange: () => void }) {
  const ping = useStore((s) => s.problemPing);
  const profiles = useStore((s) => s.profiles);
  const [msgs, setMsgs] = useState<ProblemMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadProblemMsgs(p.id)
      .then(setMsgs)
      .catch((e) => toast(friendlyError(e), "error"));
    void seenProblem(p.id);
  }, [p.id, ping]);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [msgs.length]);
  const closed = p.status === "closed" && !owner;
  const info = Object.entries(p.info ?? {});

  return (
    <>
      <button className="link-btn" onClick={onBack}>
        ← Volver
      </button>
      <h1 className="prob-title">{p.title}</h1>
      <p className="hint">
        {KIND[p.kind]} · {owner && profiles[p.user_id] ? `@${profiles[p.user_id].username} · ` : ""}
        {when(p.created_at)} · <span className={`prob-status st-${p.status}`}>{STATUS[p.status]}</span>
      </p>
      {owner && info.length > 0 && (
        <p className="hint prob-info">
          {info.map(([k, v]) => (
            <span key={k}>
              <b>{k}:</b> {String(v)}
            </span>
          ))}
        </p>
      )}
      {owner && (
        <div className="support-chips">
          {(["seen", "fixed", "closed", "open"] as ProblemStatus[])
            .filter((s) => s !== p.status)
            .map((s) => (
              <button
                key={s}
                className="tag-chip"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await setProblemStatus(p.id, s);
                    onChange();
                  } catch (e) {
                    toast(friendlyError(e), "error");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Marcar {STATUS[s].toLowerCase()}
              </button>
            ))}
        </div>
      )}
      <div className="prob-thread">
        {msgs.map((m) => {
          const fromOwner = m.author_id === FOGON_OWNER;
          const a = profiles[m.author_id];
          return (
            <div key={m.id} className={`prob-msg${fromOwner ? " from-owner" : ""}`}>
              <Avatar p={a} size="sm" />
              <div>
                <b>
                  {fromOwner ? "Gonza · creador de Fogón" : a?.display_name ?? "Usuario"} <small>{when(m.created_at)}</small>
                </b>
                <p>{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="hint">Este reporte está cerrado. Si el problema vuelve, mandá uno nuevo.</p>
      ) : (
        <form
          className="prob-reply"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setBusy(true);
            try {
              await replyProblem(p.id, text);
              setText("");
              setMsgs(await loadProblemMsgs(p.id));
              onChange();
            } catch (e) {
              toast(friendlyError(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            className="input"
            rows={2}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={owner ? "Contestale…" : "Escribile a Gonza…"}
          />
          <button className="btn primary" disabled={busy || !text.trim()}>
            Mandar
          </button>
        </form>
      )}
    </>
  );
}
