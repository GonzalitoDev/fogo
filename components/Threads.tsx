"use client";

import { useEffect, useMemo, useState } from "react";
import { friendlyError, stampLabel } from "@/lib/chat";
import { can, channelAllows, createThread, deleteThread, go, jumpToMessage, setState, threadCount, toast, updateThread, useStore } from "@/lib/store";
import type { Channel, Message } from "@/lib/types";
import { Icon } from "./Icon";
import { Confirm, Modal, useEscape } from "./ui";

const cleanName = (t: string) =>
  t
    .replace(/<a?:([A-Za-z0-9_]+):[0-9a-f-]{36}>/g, ":$1:")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

/** Crear hilo: desde un mensaje (con su texto como nombre) o suelto en el canal. */
export function CreateThreadDialog({ channelId, message, onClose }: { channelId: string; message?: Message | null; onClose: () => void }) {
  const [name, setName] = useState(() => (message ? cleanName(message.content) : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal label="Crear hilo" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await createThread({ channelId, messageId: message?.id, name: name.trim() || undefined });
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
            setBusy(false);
          }
        }}
      >
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="thread" /> Crear hilo
        </h2>
        <p className="hint">Una charla aparte, para no llenar el canal. La puede ver y escribir cualquiera que vea el canal.</p>
        <label className="field">
          <span>Nombre del hilo</span>
          <input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="De qué se habla" />
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
          <button className="btn primary" disabled={busy}>
            {busy ? "Creando…" : "Crear hilo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Cartelito debajo del mensaje que abrió un hilo. */
export function ThreadChip({ thread }: { thread: Channel }) {
  const [n, setN] = useState<number | null>(null);
  const last = thread.last_message_at;
  useEffect(() => {
    let on = true;
    void threadCount(thread.id).then((c) => on && setN(c));
    return () => {
      on = false;
    };
  }, [thread.id, last]);
  return (
    <button className="thread-chip" onClick={() => thread.server_id && go({ kind: "server", serverId: thread.server_id, channelId: thread.id })} aria-label={`Abrir hilo ${thread.name}`}>
      <Icon name="thread" />
      <b>{thread.name}</b>
      <span className="hint">
        {n === null ? "" : n === 1 ? "1 mensaje" : `${n} mensajes`}
        {last ? ` · ${stampLabel(last)}` : ""}
        {thread.archived ? " · archivado" : ""}
      </span>
    </button>
  );
}

/** Barra arriba de un hilo: volver al canal, renombrar, archivar, borrar. */
export function ThreadBar({ thread }: { thread: Channel }) {
  const parent = useStore((s) => (thread.parent_id ? s.channels[thread.parent_id] : undefined));
  const me = useStore((s) => s.me?.id);
  const canManage = useStore((s) => can(s, thread.server_id, "manage_threads") || can(s, thread.server_id, "manage_channels"));
  const mine = thread.owner_id === me;
  const [rename, setRename] = useState(false);
  const [del, setDel] = useState(false);
  const starter = useStore((s) => {
    if (!thread.starter_id || !thread.parent_id) return null;
    return s.messages[thread.parent_id]?.list.find((m) => m.id === thread.starter_id) ?? s.replyCache[thread.starter_id] ?? null;
  });

  return (
    <div className="thread-bar">
      {parent && (
        <button className="crumb" onClick={() => thread.server_id && go({ kind: "server", serverId: thread.server_id, channelId: parent.id })}>
          #{parent.name}
        </button>
      )}
      <span aria-hidden>›</span>
      <span>Hilo{thread.archived ? " archivado" : ""}</span>
      {thread.starter_id && (
        <button
          className="crumb"
          onClick={() => {
            if (starter) return jumpToMessage(starter);
            if (thread.server_id && thread.parent_id) {
              go({ kind: "server", serverId: thread.server_id, channelId: thread.parent_id });
              setState({ jumpTo: thread.starter_id! });
            }
          }}
        >
          Ver el mensaje original
        </button>
      )}
      <span className="spacer" />
      {(mine || canManage) && (
        <>
          <button className="btn ghost sm" onClick={() => setRename(true)}>
            Renombrar
          </button>
          <button
            className="btn ghost sm"
            onClick={() =>
              updateThread(thread.id, { archived: !thread.archived })
                .then(() => toast(thread.archived ? "Hilo reabierto" : "Hilo archivado: queda de solo lectura"))
                .catch((e) => toast(friendlyError(e), "error"))
            }
          >
            {thread.archived ? "Reabrir" : "Archivar"}
          </button>
        </>
      )}
      {canManage && (
        <button className="btn ghost sm danger-text" onClick={() => setDel(true)}>
          Borrar
        </button>
      )}
      {rename && <RenameThread thread={thread} onClose={() => setRename(false)} />}
      {del && (
        <Confirm
          title={`Borrar el hilo "${thread.name}"`}
          text="Se borra el hilo y todos sus mensajes. No se puede deshacer."
          action="Borrar"
          danger
          onConfirm={() =>
            deleteThread(thread.id)
              .then(() => {
                if (thread.server_id) go({ kind: "server", serverId: thread.server_id, channelId: thread.parent_id ?? null });
              })
              .catch((e) => toast(friendlyError(e), "error"))
          }
          onClose={() => setDel(false)}
        />
      )}
    </div>
  );
}

function RenameThread({ thread, onClose }: { thread: Channel; onClose: () => void }) {
  const [name, setName] = useState(thread.name);
  const [err, setErr] = useState("");
  return (
    <Modal label="Renombrar hilo" onClose={onClose}>
      <form
        style={{ display: "grid", gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateThread(thread.id, { name: name.trim() });
            onClose();
          } catch (e) {
            setErr(friendlyError(e));
          }
        }}
      >
        <h2>Renombrar hilo</h2>
        <label className="field">
          <span>Nombre</span>
          <input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
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
          <button className="btn primary" disabled={!name.trim()}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lista de hilos de un canal (botón del encabezado). */
export function ThreadsPopout({ channel, at, onClose }: { channel: Channel; at: { x: number; y: number }; onClose: () => void }) {
  const all = useStore((s) => s.channels);
  const canCreate = useStore((s) => channelAllows(s, channel.id, "create_threads") && channelAllows(s, channel.id, "send_messages"));
  const [tab, setTab] = useState<"open" | "archived">("open");
  const [create, setCreate] = useState(false);
  useEscape(onClose, !create);
  const threads = useMemo(
    () =>
      Object.values(all)
        .filter((c) => c.kind === "thread" && c.parent_id === channel.id)
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
    [all, channel.id],
  );
  const shown = threads.filter((t) => (tab === "archived" ? t.archived : !t.archived));
  return (
    <>
      <div className="backdrop" onPointerDown={onClose} />
      <div className="pins-pop threads-pop" role="dialog" aria-label={`Hilos de #${channel.name}`} style={{ right: Math.max(8, window.innerWidth - at.x), top: at.y, width: 380 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="thread" />
          <b style={{ flex: 1 }}>Hilos</b>
          {canCreate && (
            <button className="btn primary sm" onClick={() => setCreate(true)}>
              Crear
            </button>
          )}
        </header>
        <div className="threads-tabs" role="tablist">
          {(["open", "archived"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={"to-opt" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>
              {t === "open" ? "Abiertos" : "Archivados"}
            </button>
          ))}
        </div>
        {!shown.length ? (
          <p className="hint pad">{tab === "open" ? "No hay hilos abiertos. Pasá el mouse por un mensaje y tocá ⋯ → Crear hilo." : "No hay hilos archivados."}</p>
        ) : (
          <div className="thread-list">
            {shown.map((t) => (
              <button
                key={t.id}
                className="thread-item"
                onClick={() => {
                  onClose();
                  if (t.server_id) go({ kind: "server", serverId: t.server_id, channelId: t.id });
                }}
              >
                <Icon name="thread" />
                <span className="ti-text">
                  <b>{t.name}</b>
                  <span className="hint">{t.last_message_at ? `Último mensaje ${stampLabel(t.last_message_at)}` : `Creado ${stampLabel(t.created_at)}`}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {create && (
        <CreateThreadDialog
          channelId={channel.id}
          onClose={() => {
            setCreate(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
