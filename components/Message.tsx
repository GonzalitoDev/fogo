"use client";

import { BadgeRow } from "./Badges";
import { BotTag } from "./Permissions";

import { memo, useEffect, useRef, useState } from "react";
import { friendlyError, groupReactions, MAX_LEN, stampLabel, timeShort } from "@/lib/chat";
import { isJumbo, parse, render } from "@/lib/markdown";
import { cachedUrl, deleteMessage, discardFailed, editMessage, pinMessage, sendMessage, signedUrl, toast, toggleReaction, useStore } from "@/lib/store";
import type { Attachment, Message as Msg, Profile, Reaction } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, Confirm, EmojiPicker } from "./ui";

type Props = {
  m: Msg;
  head: boolean;
  me: string;
  canModerate: boolean;
  canPin?: boolean;
  canReact?: boolean;
  author?: Profile;
  authorColor?: string;
  reactions: Reaction[];
  editing: boolean;
  onEdit: (on: boolean) => void;
  onReply: () => void;
  onJump: (id: string) => void;
  onAuthor: (p: Profile, at: { x: number; y: number }) => void;
  onImage: (url: string, name: string) => void;
  mentionLabel: (u: string) => { label: string; me: boolean } | null;
};

function AttachmentImg({ a, onOpen }: { a: Attachment; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState(() => cachedUrl(a.path));
  useEffect(() => {
    if (url) return;
    let alive = true;
    void signedUrl(a.path).then(() => alive && setUrl(cachedUrl(a.path)));
    return () => {
      alive = false;
    };
  }, [a.path, url]);
  const ratio = a.width && a.height ? `${a.width} / ${a.height}` : undefined;
  return (
    <button className={`att${url ? "" : " ph"}`} onClick={() => url && onOpen(url)} aria-label={`Ver ${a.name}`} style={url ? undefined : { aspectRatio: ratio, width: a.width ? Math.min(400, a.width) : undefined, height: "auto", maxHeight: 320 }}>
      {url && <img src={url} alt={a.name} width={a.width} height={a.height} style={{ aspectRatio: ratio }} loading="lazy" />}
    </button>
  );
}

function ReplyRef({ id, onJump, mentionLabel }: { id: string; onJump: (id: string) => void; mentionLabel: Props["mentionLabel"] }) {
  const loaded = useStore((s) => {
    for (const c of Object.values(s.messages)) {
      const f = c.list.find((m) => m.id === id);
      if (f) return f;
    }
    return s.replyCache[id];
  });
  const author = useStore((s) => (loaded ? s.profiles[loaded.author_id] : undefined));
  if (loaded === undefined) return <div className="reply-ref">Cargando respuesta…</div>;
  if (loaded === null)
    return (
      <div className="reply-ref">
        <span>
          <i>El mensaje original fue borrado</i>
        </span>
      </div>
    );
  const text = loaded.content.replace(/\s+/g, " ").slice(0, 140) || "Imagen";
  return (
    <button className="reply-ref" onClick={() => onJump(id)} aria-label={`Ir al mensaje de ${author?.display_name ?? "alguien"}`}>
      <Avatar p={author} size="xs" />
      <b style={{ color: author?.color }}>@{author?.display_name ?? "…"}</b>
      <span>{render(parse(text), { mentionLabel })}</span>
    </button>
  );
}

function EditBox({ m, onDone }: { m: Msg; onDone: () => void }) {
  const [v, setV] = useState(m.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current!;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  const save = () => {
    const t = v.trim();
    if (!t && !m.attachments.length) return;
    if (t.length > MAX_LEN) return;
    void editMessage(m, t);
    onDone();
  };
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={v}
        rows={1}
        aria-label="Editar mensaje"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <div className="hint">
        Esc para{" "}
        <button onClick={onDone} style={{ border: 0, background: "none", padding: 0, color: "var(--accent)" }}>
          cancelar
        </button>{" "}
        · Enter para{" "}
        <button onClick={save} style={{ border: 0, background: "none", padding: 0, color: "var(--accent)" }}>
          guardar
        </button>
      </div>
    </div>
  );
}

function MessageView(p: Props) {
  const { m, me } = p;
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const mine = m.author_id === me;
  const groups = groupReactions(p.reactions, me);
  const mentioned = m.mentions.includes(me);
  const jumbo = !m.attachments.length && isJumbo(m.content);
  const profiles = useStore((s) => s.profiles);

  const del = (e: React.MouseEvent) => {
    if (e.shiftKey) void deleteMessage(m);
    else setConfirm(true);
  };

  return (
    <div
      className={`msg${p.head ? " head" : ""}${mentioned ? " mentioned" : ""}${m.status ? ` ${m.status}` : ""}`}
      id={`m-${m.id}`}
      data-id={m.id}
    >
      {m.reply_to_id && <ReplyRef id={m.reply_to_id} onJump={p.onJump} mentionLabel={p.mentionLabel} />}
      {p.head ? (
        <button
          className="av-btn"
          style={{ border: 0, background: "none", padding: 0, alignSelf: "start", marginTop: 2, height: 40 }}
          onClick={(e) => p.author && p.onAuthor(p.author, { x: e.clientX, y: e.clientY })}
          aria-label={`Perfil de ${p.author?.display_name ?? "usuario"}`}
          tabIndex={-1}
        >
          <Avatar p={p.author} />
        </button>
      ) : (
        <span className="gutter" aria-hidden="true">
          {timeShort(m.created_at)}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        {p.head && (
          <div className="meta">
            <button className="author" style={{ ["--c" as string]: p.authorColor ?? "var(--ink)" }} onClick={(e) => p.author && p.onAuthor(p.author, { x: e.clientX, y: e.clientY })}>
              {p.author?.display_name ?? "…"}
            </button>
            {p.author?.is_bot && <BotTag />}
            <BadgeRow p={p.author} />
            {m.pinned_at && (
              <span className="pinned-mark" title="Mensaje fijado">
                <Icon name="pin" />
              </span>
            )}
            <time className="when" dateTime={m.created_at} title={new Date(m.created_at).toLocaleString("es-AR")}>
              {stampLabel(m.created_at)}
            </time>
          </div>
        )}
        {p.editing ? (
          <EditBox m={m} onDone={() => p.onEdit(false)} />
        ) : (
          m.content && (
            <div className={`body${jumbo ? " jumbo" : ""}`}>
              {render(parse(m.content), { mentionLabel: p.mentionLabel })}
              {m.edited_at && (
                <span className="edited" title={`Editado ${stampLabel(m.edited_at)}`}>
                  (editado)
                </span>
              )}
            </div>
          )
        )}
        {(m.attachments.length > 0 || (m.localFiles?.length ?? 0) > 0) && (
          <div className="atts">
            {m.attachments.length
              ? m.attachments.map((a) => <AttachmentImg key={a.path} a={a} onOpen={(url) => p.onImage(url, a.name)} />)
              : m.localFiles!.map((f) => (
                  <span key={f.url} className="att">
                    <img src={f.url} alt={f.name} />
                  </span>
                ))}
          </div>
        )}
        {groups.length > 0 && (
          <div className="reactions">
            {groups.map((g) => (
              <button
                key={g.emoji}
                className={`react${g.mine ? " mine" : ""}`}
                onClick={() => p.canReact !== false && void toggleReaction(m.id, g.emoji)}
                aria-pressed={g.mine}
                aria-label={`${g.emoji} ${g.count}`}
                title={g.users.map((u) => profiles[u]?.display_name ?? "alguien").join(", ")}
              >
                {g.emoji}
                <b>{g.count}</b>
              </button>
            ))}
          </div>
        )}
        {m.status === "failed" && (
          <div className="retry">
            <span style={{ color: "var(--danger)" }}>No se pudo enviar.</span>
            <button onClick={() => void sendMessage(m.channel_id, m.content, [], m.reply_to_id, m.id)}>Reintentar</button>
            <button onClick={() => discardFailed(m.channel_id, m.id)}>Descartar</button>
          </div>
        )}
      </div>

      {!m.status && !p.editing && (
        <div className={`msg-tools${picker ? " open" : ""}`} role="toolbar" aria-label="Acciones del mensaje">
          {p.canReact !== false && (
            <button
              className="icon-btn"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setPicker({ x: r.right, y: r.top });
              }}
              aria-label="Reaccionar"
              title="Reaccionar"
            >
              <Icon name="smile" />
            </button>
          )}
          <button className="icon-btn" onClick={p.onReply} aria-label="Responder" title="Responder">
            <Icon name="reply" />
          </button>
          {mine && (
            <button className="icon-btn" onClick={() => p.onEdit(true)} aria-label="Editar" title="Editar">
              <Icon name="edit" />
            </button>
          )}
          {p.canPin && (
            <button
              className="icon-btn"
              onClick={() => void pinMessage(m, !m.pinned_at).catch((e) => toast(friendlyError(e), "error"))}
              aria-label={m.pinned_at ? "Desfijar" : "Fijar mensaje"}
              title={m.pinned_at ? "Desfijar" : "Fijar mensaje"}
            >
              <Icon name="pin" />
            </button>
          )}
          {(mine || p.canModerate) && (
            <button className="icon-btn danger" onClick={del} aria-label="Borrar" title="Borrar (Shift+clic borra sin preguntar)">
              <Icon name="trash" />
            </button>
          )}
        </div>
      )}
      {picker && <EmojiPicker at={picker} onPick={(e) => void toggleReaction(m.id, e)} onClose={() => setPicker(null)} />}
      {confirm && (
        <Confirm
          title="Borrar mensaje"
          text={`Se borra para todos. ${m.content ? `“${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}”` : ""}`}
          action="Borrar"
          danger
          onConfirm={() => deleteMessage(m)}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

export const Message = memo(MessageView);
