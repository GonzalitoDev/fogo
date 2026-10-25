"use client";

import { PollDialog } from "./Poll";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { activeTrigger, filterProfiles, IMAGE_TYPES, MAX_FILE, MAX_LEN } from "@/lib/chat";
import { EMOJI_TOKEN, emojiToken, sendMessage, toast, usableEmojis, useStore } from "@/lib/store";
import type { Channel, Message, Profile } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, EmojiPicker } from "./ui";

// la carita del botón cambia cada vez que pasás el mouse, como en Discord
const EMOJI_FACES = ["😀", "😄", "😎", "🤩", "😂", "🥳", "😺", "🤔"];

export type ComposerHandle = { addFiles: (f: File[]) => void; focus: () => void; mention: (username: string) => void };

const drafts = new Map<string, string>();

type Props = {
  channelId: string;
  placeholder: string;
  people: Profile[];
  everyone?: boolean;
  channels: Channel[];
  replyTo: Message | null;
  replyAuthor?: Profile;
  onCancelReply: () => void;
  onEditLast: () => void;
  onTyping?: (stop?: boolean) => void;
  noAttach?: boolean;
  /** muestra el botón para crear encuestas */
  canPoll?: boolean;
  disabled?: string;
};

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(p, ref) {
  const [text, setText] = useState(() => drafts.get(p.channelId) ?? "");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [emoji, setEmoji] = useState<{ x: number; y: number } | null>(null);
  const [face, setFace] = useState(0);
  const [poll, setPoll] = useState(false);
  const servers = useStore((s) => s.servers);
  const emojis = useStore((s) => s.emojis);
  const meP = useStore((s) => s.me);
  const chServer = useStore((s) => s.channels[p.channelId]?.server_id ?? null);
  // :nombre: -> emoji propio (los del servidor primero; con Premium, los de todos)
  const byName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of usableEmojis({ servers, emojis, me: meP } as Parameters<typeof usableEmojis>[0], chServer))
      for (const e of g.list) if (!map.has(e.name.toLowerCase())) map.set(e.name.toLowerCase(), emojiToken(e));
    return map;
  }, [servers, emojis, meP, chServer]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // cambia el canal: guarda el borrador y carga el del nuevo
  const [lastChannel, setLastChannel] = useState(p.channelId);
  if (lastChannel !== p.channelId) {
    setLastChannel(p.channelId);
    setText(drafts.get(p.channelId) ?? "");
    setFiles([]);
  }
  useEffect(() => {
    drafts.set(p.channelId, text);
  }, [text, p.channelId]);
  useEffect(() => {
    ta.current?.focus();
  }, [p.channelId, p.replyTo?.id]);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  const addFiles = (list: File[]) => {
    if (p.noAttach) return toast("No tenés permiso para adjuntar archivos en este canal.", "error");
    const ok: { file: File; url: string }[] = [];
    for (const f of list) {
      if (!IMAGE_TYPES.includes(f.type)) {
        toast(`“${f.name}” no es una imagen. Se pueden mandar PNG, JPG, GIF o WebP.`, "error");
        continue;
      }
      if (f.size > MAX_FILE) {
        toast(`“${f.name}” pesa más de 10 MB.`, "error");
        continue;
      }
      ok.push({ file: f, url: URL.createObjectURL(f) });
    }
    setFiles((cur) => {
      const next = [...cur, ...ok];
      if (next.length > 4) toast("Hasta 4 imágenes por mensaje.", "error");
      return next.slice(0, 4);
    });
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => ta.current?.focus(),
    mention: (username) => {
      setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${username} `);
      setTimeout(() => ta.current?.focus());
    },
  }));

  const trig = activeTrigger(text, caret);
  const suggestions = useMemo(() => {
    if (!trig || dismissed === trig.start) return null;
    if (trig.char === "@") {
      const list = filterProfiles(p.people, trig.query);
      if (p.everyone && "everyone".startsWith(trig.query)) list.unshift({ id: "everyone", username: "everyone", display_name: "Todos los miembros", color: "#99a8a4" });
      return list.length ? { kind: "@" as const, list } : null;
    }
    const list = p.channels.filter((c) => c.name.includes(trig.query)).slice(0, 8);
    return list.length ? { kind: "#" as const, list } : null;
  }, [trig?.char, trig?.query, trig?.start, dismissed, p.people, p.channels, p.everyone]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = (value: string) => {
    if (!trig) return;
    const before = text.slice(0, trig.start);
    const after = text.slice(caret);
    const insert = `${trig.char}${value} `;
    const next = before + insert + after.replace(/^\S*/, "");
    setText(next);
    const pos = (before + insert).length;
    setCaret(pos);
    setSel(0);
    requestAnimationFrame(() => {
      ta.current?.setSelectionRange(pos, pos);
      ta.current?.focus();
    });
  };

  const send = () => {
    // fuera de bloques de código, :nombre: pasa a ser el emoji propio
    const content = text
      .trim()
      .split(/(```[\s\S]*?```|`[^`\n]+`)/)
      .map((part, i) => (i % 2 ? part : part.replace(/(?<![<\w]):(\w{2,32}):/g, (all, n: string) => byName.get(n.toLowerCase()) ?? all)))
      .join("");
    if (!content && !files.length) return;
    if (content.length > MAX_LEN) return toast(`El mensaje tiene ${content.length} caracteres; el máximo es ${MAX_LEN}.`, "error");
    void sendMessage(p.channelId, content, files.map((f) => f.file), p.replyTo?.id ?? null);
    p.onTyping?.(true);
    setText("");
    setFiles([]);
    drafts.delete(p.channelId);
    p.onCancelReply();
  };

  const count = text.trim().length;
  const insertEmoji = (raw: string) => {
    const tok = EMOJI_TOKEN.exec(raw);
    const e = tok ? `:${tok[2]}:` : raw;
    const el = ta.current;
    const at = el ? el.selectionStart : text.length;
    const next = text.slice(0, at) + e + text.slice(at);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  };

  return (
    <div className="composer">
      {suggestions && (
        <div className="suggest" role="listbox" aria-label={suggestions.kind === "@" ? "Personas" : "Canales"}>
          <div className="title">{suggestions.kind === "@" ? "Personas" : "Canales"}</div>
          {suggestions.kind === "@"
            ? suggestions.list.map((u, i) => (
                <button key={u.id} role="option" aria-selected={i === sel} onMouseDown={(e) => e.preventDefault()} onClick={() => complete(u.username)}>
                  <Avatar p={u} size="xs" />
                  <b>{u.display_name}</b>
                  <span className="sub">@{u.username}</span>
                </button>
              ))
            : suggestions.list.map((c, i) => (
                <button key={c.id} role="option" aria-selected={i === sel} onMouseDown={(e) => e.preventDefault()} onClick={() => complete(c.name)}>
                  <Icon name="hash" />
                  {c.name}
                </button>
              ))}
        </div>
      )}
      <div className="composer-box">
        {p.replyTo && (
          <div className="composer-bar">
            <span>
              Respondiendo a <b>{p.replyAuthor?.display_name ?? "…"}</b>
            </span>
            <span className="spacer" />
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={p.onCancelReply} aria-label="Cancelar respuesta">
              <Icon name="close" />
            </button>
          </div>
        )}
        {files.length > 0 && (
          <div className="previews">
            {files.map((f, i) => (
              <div className="preview" key={f.url}>
                <img src={f.url} alt={f.file.name} />
                <button className="icon-btn" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Quitar ${f.file.name}`}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-row">
          <button className="icon-btn plus-btn" onClick={() => fileInput.current?.click()} aria-label="Subir una imagen" title={p.noAttach ? "No podés adjuntar archivos en este canal" : "Subir una imagen"} disabled={p.noAttach}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="currentColor" />
              <path d="M12 7v10M7 12h10" stroke="var(--input-bg)" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <textarea
            id={`composer-${p.channelId}`}
            ref={ta}
            rows={1}
            value={text}
            placeholder={p.placeholder}
            aria-label={p.placeholder}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) p.onTyping?.();
              setCaret(e.target.selectionStart);
              setSel(0);
              setDismissed(null);
            }}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
            onPaste={(e) => {
              const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
              if (imgs.length) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            onKeyDown={(e) => {
              if (suggestions) {
                const n = suggestions.list.length;
                if (e.key === "ArrowDown") return e.preventDefault(), setSel((s) => (s + 1) % n);
                if (e.key === "ArrowUp") return e.preventDefault(), setSel((s) => (s - 1 + n) % n);
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const item = suggestions.list[sel];
                  return complete("username" in item ? item.username : item.name);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  return setDismissed(trig!.start);
                }
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
              if (e.key === "ArrowUp" && !text) {
                e.preventDefault();
                p.onEditLast();
              }
              if (e.key === "Escape" && p.replyTo) {
                e.preventDefault();
                e.stopPropagation();
                p.onCancelReply();
              }
            }}
          />
          {p.canPoll && (
            <button className="icon-btn poll-btn" onClick={() => setPoll(true)} aria-label="Crear encuesta" title="Crear encuesta">
              <Icon name="poll" />
            </button>
          )}
          <button
            className="icon-btn emoji-btn"
            onMouseEnter={() => setFace((f) => (f + 1) % EMOJI_FACES.length)}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setEmoji({ x: r.right, y: r.top });
            }}
            aria-label="Elegir un emoji"
            title="Elegir un emoji"
          >
            <span aria-hidden="true">{EMOJI_FACES[face]}</span>
          </button>
          <button className="icon-btn send-mobile" onClick={send} aria-label="Enviar" title="Enviar (Enter)" disabled={!count && !files.length}>
            <Icon name="send" />
          </button>
        </div>
      </div>
      {emoji && <EmojiPicker at={emoji} onPick={insertEmoji} onClose={() => setEmoji(null)} />}
      {poll && <PollDialog channelId={p.channelId} onClose={() => setPoll(false)} />}
      {count > MAX_LEN - 200 && (
        <span className={`count${count > MAX_LEN ? " over" : ""}`}>
          {count}/{MAX_LEN}
        </span>
      )}
    </div>
  );
});
