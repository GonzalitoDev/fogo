"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeSupport, fallbackDraft, type SupportDraft } from "@/lib/ai";
import { friendlyError } from "@/lib/chat";
import { discoverCommunities, getState, go, joinServer, sendSupportReport, setServerPublic, toast, useStore, type CommunityCard } from "@/lib/store";
import type { Profile, Server } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, Modal } from "./ui";

const cardProfile = (c: CommunityCard) => ({ display_name: c.name, color: "#4f9d69" }) as Profile;

/** Directorio público de comunidades: buscar, ver la oficial y unirse. */
export function DiscoverDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [list, setList] = useState<CommunityCard[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const load = (query: string, tg: string | null) => {
    const my = ++seq.current;
    setErr("");
    void discoverCommunities(query, tg)
      .then((rows) => {
        if (my !== seq.current) return;
        setList(rows);
        if (!tg) {
          const counts = new Map<string, number>();
          for (const c of rows) for (const t of c.tags) if (t !== "oficial") counts.set(t, (counts.get(t) ?? 0) + 1);
          setAllTags([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t));
        }
      })
      .catch((e) => {
        if (my !== seq.current) return;
        setErr(friendlyError(e));
        setList([]);
      });
  };

  useEffect(() => {
    load("", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q, tag), 300);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag]);

  const join = async (c: CommunityCard) => {
    setBusy(c.id);
    try {
      await joinServer(c.invite_code);
      toast(`Entraste a ${c.name}`);
      onClose();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const open = (c: CommunityCard) => {
    if (getState().servers[c.id]) go({ kind: "server", serverId: c.id, channelId: null });
    onClose();
  };

  return (
    <Modal label="Comunidades" onClose={onClose} wide>
      <h2>Comunidades</h2>
      <div className="discover-search">
        <Icon name="search" />
        <input className="input" autoFocus placeholder="Buscar por nombre, descripción o tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar comunidades" />
      </div>
      {allTags.length > 0 && (
        <div className="tag-row">
          <button className={`tag-chip${tag === null ? " on" : ""}`} onClick={() => setTag(null)}>
            Todas
          </button>
          {allTags.map((t) => (
            <button key={t} className={`tag-chip${tag === t ? " on" : ""}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      {!list ? (
        <p className="hint">Buscando comunidades…</p>
      ) : !list.length ? (
        <p className="hint">No hay comunidades que coincidan. Para sumar la tuya, publicala desde el menú del servidor.</p>
      ) : (
        <div className="community-list">
          {list.map((c) => (
            <div key={c.id} className={`community-card${c.official ? " official" : ""}`}>
              <Avatar p={cardProfile(c)} src={c.icon_url} size="lg" />
              <div className="community-text">
                <div className="community-name">
                  <b>{c.name}</b>
                  {c.official && (
                    <span className="official-tag">
                      <Icon name="check" /> Oficial
                    </span>
                  )}
                </div>
                {c.description && <p>{c.description}</p>}
                <div className="community-meta">
                  {c.tags.map((t) => (
                    <span key={t} className="tag-chip mini">{t}</span>
                  ))}
                  <span className="hint">{c.members} {c.members === 1 ? "miembro" : "miembros"}{c.boosts > 0 ? ` · ${c.boosts} boosts` : ""}</span>
                </div>
              </div>
              {c.already_member ? (
                <button className="btn" onClick={() => open(c)}>
                  Abrir
                </button>
              ) : (
                <button className="btn primary" disabled={busy === c.id} onClick={() => void join(c)}>
                  {busy === c.id ? "Entrando…" : "Unirme"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="hint">¿Querés que tu servidor aparezca acá? Menú del servidor → Publicar en el directorio.</p>
      <div className="foot">
        <button className="btn ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

/** Publicar / despublicar el servidor en el directorio. */
export function PublishDialog({ server, onClose }: { server: Server; onClose: () => void }) {
  const live = useStore((s) => s.servers[server.id] ?? server);
  const [on, setOn] = useState(!!live.is_public);
  const [desc, setDesc] = useState(live.description ?? "");
  const [tags, setTags] = useState((live.tags ?? []).filter((t) => t !== "oficial").join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal label="Directorio de comunidades" onClose={onClose}>
      <h2>Directorio</h2>
      <p>Si lo publicás, cualquiera con cuenta en Fogón puede ver el nombre, la descripción y entrar con el link de invitación.</p>
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>Mostrar {live.name} en el directorio público</span>
      </label>
      <label className="field">
        <span>Descripción</span>
        <textarea className="input" rows={3} maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="De qué se trata, a quién está dirigido…" />
      </label>
      <label className="field">
        <span>Tags (separados por coma)</span>
        <input className="input" maxLength={160} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gaming, amigos, música" />
      </label>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="foot">
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await setServerPublic(server.id, { isPublic: on, description: desc, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
              toast(on ? "Tu comunidad está en el directorio" : "Tu comunidad ya no aparece en el directorio");
              onClose();
            } catch (e) {
              setErr(friendlyError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

const CAT_LABEL: Record<SupportDraft["category"], string> = { bug: "Bug", acoso: "Acoso", spam: "Spam", otro: "Otro" };
const URG_LABEL: Record<SupportDraft["urgency"], string> = { baja: "Baja", media: "Media", alta: "Alta" };

/** Reporte de soporte: la IA lo ordena y se manda como ticket al ModMail. */
export function SupportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [draft, setDraft] = useState<SupportDraft | null>(null);
  const [busy, setBusy] = useState<"ia" | "send" | null>(null);
  const [err, setErr] = useState("");
  const ready = text.trim().length >= 10;

  const analyze = async () => {
    if (!ready) return;
    setBusy("ia");
    setErr("");
    try {
      setDraft(await analyzeSupport(text, where));
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    if (!ready) return;
    const d = draft ?? fallbackDraft(text);
    setBusy("send");
    setErr("");
    try {
      await sendSupportReport(d, text, where);
      toast("Reporte enviado al staff. Te contestan por privado.");
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(null);
    }
  };

  return (
    <Modal label="Soporte" onClose={onClose} wide>
      <h2>Reportar al staff</h2>
      <p>Esto abre un ticket privado con el staff de la Comunidad de Fogón. La IA te ayuda a ordenarlo antes de mandarlo.</p>
      <label className="field">
        <span>¿Qué pasó?</span>
        <textarea
          className="input"
          rows={4}
          maxLength={2000}
          value={text}
          autoFocus
          onChange={(e) => {
            setText(e.target.value);
            setDraft(null);
          }}
          placeholder="Contá lo que pasó con el mayor detalle posible: quién, dónde y qué hizo."
        />
      </label>
      <label className="field">
        <span>¿Dónde? (opcional)</span>
        <input className="input" maxLength={120} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Servidor / canal / privado" />
      </label>
      {draft && (
        <div className="support-draft">
          <div className="support-chips">
            <span className="tag-chip mini">{CAT_LABEL[draft.category]}</span>
            <span className={`tag-chip mini urgency-${draft.urgency}`}>Urgencia {URG_LABEL[draft.urgency]}</span>
          </div>
          <b>{draft.summary}</b>
          <p>{draft.message}</p>
        </div>
      )}
      {err && <div className="err" role="alert">{err}</div>}
      <p className="hint">La IA procesa tu texto con Pollinations y puede equivocarse; revisá el resumen. No mandes contraseñas ni datos sensibles.</p>
      <div className="foot">
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" type="button" disabled={!ready || !!busy} onClick={() => void analyze()}>
          {busy === "ia" ? "Analizando…" : draft ? "Volver a analizar" : "Ordenar con IA"}
        </button>
        <button className="btn primary" type="button" disabled={!ready || !!busy} onClick={() => void send()}>
          {busy === "send" ? "Enviando…" : "Enviar al staff"}
        </button>
      </div>
    </Modal>
  );
}
