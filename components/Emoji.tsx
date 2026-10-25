"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { friendlyError } from "@/lib/chat";
import { can, deleteEmoji, EMOJI_TOKEN, mediaUrl, renameEmoji, serverEmojis, toast, uploadEmoji, useStore, wantEmoji } from "@/lib/store";
import type { Server } from "@/lib/types";
import { Icon } from "./Icon";
import { Avatar, Confirm } from "./ui";

/** Un emoji propio (o :nombre: si se borró). */
export function CustomEmoji({ id, name, size }: { id: string; name: string; size?: number }) {
  const e = useStore((s) => s.emojis[id]);
  useEffect(() => {
    if (!e) wantEmoji(id);
  }, [e, id]);
  if (!e) return <span className="cemoji-missing">:{name}:</span>;
  return <img className="cemoji" src={mediaUrl(e.path) ?? ""} alt={`:${e.name}:`} title={`:${e.name}:`} draggable={false} style={size ? { width: size, height: size } : undefined} />;
}

/** Para render() del markdown. */
export const renderEmoji = (id: string, name: string, key: string): ReactNode => <CustomEmoji key={key} id={id} name={name} />;

/** Un emoji guardado como texto: unicode o <:nombre:id>. */
export function EmojiText({ e, size }: { e: string; size?: number }) {
  const m = EMOJI_TOKEN.exec(e);
  if (m) return <CustomEmoji id={m[3]} name={m[2]} size={size} />;
  return <>{e}</>;
}

const NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
const nameFromFile = (f: File) =>
  f.name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .padEnd(2, "_") || "emoji";

/** Sección "Emojis" de los ajustes del servidor. */
export function EmojiSettings({ server }: { server: Server }) {
  const all = useStore((s) => s.emojis);
  const list = useMemo(() => serverEmojis({ emojis: all } as Parameters<typeof serverEmojis>[0], server.id), [all, server.id]);
  const profiles = useStore((s) => s.profiles);
  const canManage = useStore((s) => can(s, server.id, "manage_emojis"));
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(0);
  const [del, setDel] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = server.boost_count ?? 0;
    setLimit(c >= 14 ? 250 : c >= 7 ? 150 : c >= 2 ? 100 : 50);
  }, [server.boost_count]);

  const add = async (files: File[]) => {
    for (const f of files) {
      if (list.length + busy >= limit) return toast(`Llegaste al máximo de ${limit} emojis.`, "error");
      let name = nameFromFile(f);
      const taken = new Set(list.map((e) => e.name.toLowerCase()));
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${name.slice(0, 29)}_${i}`;
      setBusy((b) => b + 1);
      try {
        await uploadEmoji(server.id, f, name);
      } catch (e) {
        toast(friendlyError(e), "error");
      } finally {
        setBusy((b) => b - 1);
      }
    }
  };

  return (
    <div className="emoji-settings">
      <p className="hint">
        Subí emojis para que cualquiera los use en {server.name}. Se escriben con dos puntos, como <code>:mate:</code>. Con Fogón Premium se pueden usar en cualquier servidor.
      </p>
      <ul className="hint emoji-rules">
        <li>PNG, JPG, WEBP o GIF (los GIF quedan animados, hasta 512 KB).</li>
        <li>Nombre de 2 a 32 letras, números o guiones bajos.</li>
        <li>Se achican a 128 × 128.</li>
      </ul>
      {canManage && (
        <div>
          <button className="btn primary" onClick={() => file.current?.click()} disabled={list.length >= limit || busy > 0}>
            {busy ? "Subiendo…" : "Subir emoji"}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              void add([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      <h3 className="emoji-count">
        Emojis — {list.length} de {limit} lugares
      </h3>
      {!list.length ? (
        <p className="hint">Todavía no hay emojis propios.</p>
      ) : (
        <div className="emoji-table" role="table" aria-label="Emojis del servidor">
          {list.map((e) => (
            <EmojiRow key={e.id} id={e.id} name={e.name} by={e.created_by ? profiles[e.created_by] : null} canManage={canManage} onDelete={() => setDel(e.id)} />
          ))}
        </div>
      )}
      {del && (
        <Confirm
          title="Borrar emoji"
          text={`Se borra :${list.find((e) => e.id === del)?.name ?? ""}: del servidor. Donde ya se usó va a aparecer como texto.`}
          action="Borrar"
          danger
          onConfirm={() => deleteEmoji(del).catch((e) => toast(friendlyError(e), "error"))}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}

function EmojiRow({ id, name, by, canManage, onDelete }: { id: string; name: string; by: import("@/lib/types").Profile | null; canManage: boolean; onDelete: () => void }) {
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  const save = () => {
    const n = v.trim();
    if (n === name) return;
    if (!NAME_RE.test(n)) {
      setV(name);
      return toast("El nombre tiene que tener de 2 a 32 letras, números o guiones bajos.", "error");
    }
    renameEmoji(id, n).catch((e) => {
      setV(name);
      toast(friendlyError(e), "error");
    });
  };
  return (
    <div className="emoji-row" role="row">
      <span role="cell" className="emoji-img">
        <CustomEmoji id={id} name={name} size={32} />
      </span>
      <span role="cell" className="emoji-name">
        {canManage ? (
          <input
            className="input"
            value={v}
            maxLength={32}
            aria-label={`Nombre de :${name}:`}
            onChange={(e) => setV(e.target.value.replace(/[^A-Za-z0-9_]/g, "_"))}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          />
        ) : (
          <code>:{name}:</code>
        )}
      </span>
      <span role="cell" className="emoji-by">
        {by && (
          <>
            <Avatar p={by} size="xs" /> {by.display_name}
          </>
        )}
      </span>
      {canManage && (
        <button className="icon-btn" role="cell" aria-label={`Borrar :${name}:`} title="Borrar" onClick={onDelete}>
          <Icon name="trash" />
        </button>
      )}
    </div>
  );
}
