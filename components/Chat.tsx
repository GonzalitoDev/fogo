"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildRows, channelTree, dayLabel } from "@/lib/chat";
import { loadOlder, openDm, fail, useStore } from "@/lib/store";
import type { Channel, Message as Msg, Profile } from "@/lib/types";
import { Composer, type ComposerHandle } from "./Composer";
import { Icon } from "./Icon";
import { Message } from "./Message";
import { Avatar, Menu, useEscape } from "./ui";

const EMPTY: never[] = [];

export function ChatPane({ channel, onMenu, membersOpen, onToggleMembers }: { channel: Channel; onMenu: () => void; membersOpen: boolean; onToggleMembers: () => void }) {
  const me = useStore((s) => s.me);
  const cm = useStore((s) => s.messages[channel.id]);
  const reactions = useStore((s) => s.reactions);
  const profiles = useStore((s) => s.profiles);
  const members = useStore((s) => (channel.server_id ? s.members[channel.server_id] : undefined));
  const peerId = useStore((s) => s.dmPeers[channel.id]);
  const server = useStore((s) => (channel.server_id ? s.servers[channel.server_id] : undefined));
  const allChannels = useStore((s) => s.channels);
  const online = useStore((s) => s.online);

  const list = cm?.list ?? (EMPTY as Msg[]);
  const rows = useMemo(() => buildRows(list), [list]);
  const peer = peerId ? profiles[peerId] : undefined;
  const isDm = channel.kind === "dm";
  const title = isDm ? peer?.display_name ?? "Mensaje directo" : channel.name;
  const canModerate = !!server && server.owner_id === me?.id;

  const people = useMemo(() => {
    const ids = isDm ? [peerId, me?.id] : members ?? [];
    return ids.map((id) => (id ? profiles[id] : undefined)).filter((p): p is Profile => !!p);
  }, [isDm, peerId, me?.id, members, profiles]);
  const serverChannels = useMemo(() => (channel.server_id ? channelTree(Object.values(allChannels), channel.server_id).flat : []), [allChannels, channel.server_id]);

  const mentionLabel = useCallback(
    (username: string) => {
      const p = people.find((x) => x.username === username) ?? Object.values(profiles).find((x) => x.username === username);
      return p ? { label: p.display_name, me: p.id === me?.id } : null;
    },
    [people, profiles, me?.id],
  );

  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [authorMenu, setAuthorMenu] = useState<{ p: Profile; at: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevFirst = useRef<string | null>(null);
  const prevHeight = useRef(0);

  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
    stick.current = true;
    prevFirst.current = null;
  }, [channel.id]);

  // scroll: abajo al entrar y cuando llegan mensajes si ya estabas abajo; quieto al cargar historial
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = list[0]?.id ?? null;
    if (prevFirst.current && first !== prevFirst.current && list.some((m) => m.id === prevFirst.current)) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirst.current = first;
    prevHeight.current = el.scrollHeight;
  }, [list, channel.id]);

  // las imágenes cambian la altura al cargar: si estás abajo, seguí abajo
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
      prevHeight.current = el.scrollHeight;
    });
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [channel.id]);

  const onScroll = () => {
    const el = scroller.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 300 && cm?.hasMore && !cm.loading) void loadOlder(channel.id);
  };

  const jump = (id: string) => {
    const el = document.getElementById(`m-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  };

  const editLast = () => {
    const last = [...list].reverse().find((m) => m.author_id === me?.id && !m.status);
    if (last) setEditing(last.id);
  };

  useEscape(() => setLightbox(null), !!lightbox);

  return (
    <section
      className="chat"
      aria-label={isDm ? `Charla con ${title}` : `Canal ${title}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        composer.current?.addFiles([...e.dataTransfer.files]);
      }}
      style={{ position: "relative" }}
    >
      <header className="chat-head">
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Abrir navegación">
          <Icon name="menu" />
        </button>
        {isDm ? <Avatar p={peer} size="xs" /> : <Icon name="hash" className="hash" />}
        <h2>{title}</h2>
        {!isDm && channel.topic && <span className="topic">{channel.topic}</span>}
        <span className="spacer" />
        {!isDm && (
          <button className={`icon-btn${membersOpen ? " on" : ""}`} onClick={onToggleMembers} aria-pressed={membersOpen} aria-label="Lista de miembros" title="Miembros (Ctrl+U)">
            <Icon name="users" />
          </button>
        )}
      </header>
      {!online && <div className="offline">Sin conexión. Los mensajes nuevos van a aparecer cuando vuelva.</div>}

      <div className="msgs" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label={`Mensajes de ${title}`}>
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <div className="msgs-spacer" />
          {cm && !cm.hasMore && (
            <div className="welcome">
              <div className="big">{isDm ? <Avatar p={peer} /> : <Icon name="hash" />}</div>
              <h3>{isDm ? peer?.display_name ?? "Mensaje directo" : `Bienvenido a #${channel.name}`}</h3>
              <p>{isDm ? `Este es el comienzo de tu charla con @${peer?.username ?? "…"}.` : `Este es el comienzo del canal #${channel.name}.${channel.topic ? ` ${channel.topic}` : ""}`}</p>
            </div>
          )}
          {(!cm || cm.loading) && <div className="loading-more">Cargando mensajes…</div>}
          {rows.map((r) =>
            r.kind === "day" ? (
              <div key={r.key} className="day" role="separator">
                {dayLabel(r.date)}
              </div>
            ) : (
              <Message
                key={r.key}
                m={r.msg}
                head={r.head}
                me={me?.id ?? ""}
                canModerate={canModerate}
                author={profiles[r.msg.author_id]}
                reactions={reactions[r.msg.id] ?? EMPTY}
                editing={editing === r.msg.id}
                onEdit={(on) => setEditing(on ? r.msg.id : null)}
                onReply={() => setReplyTo(r.msg)}
                onJump={jump}
                onAuthor={(p, at) => setAuthorMenu({ p, at })}
                onImage={(url, name) => setLightbox({ url, name })}
                mentionLabel={mentionLabel}
              />
            ),
          )}
        </div>
      </div>

      <Composer
        ref={composer}
        channelId={channel.id}
        placeholder={isDm ? `Mensaje para @${peer?.username ?? "…"}` : `Mensaje en #${channel.name}`}
        people={people}
        channels={serverChannels}
        replyTo={replyTo}
        replyAuthor={replyTo ? profiles[replyTo.author_id] : undefined}
        onCancelReply={() => setReplyTo(null)}
        onEditLast={editLast}
      />

      {dragging && <div className="drop">Soltá para adjuntar</div>}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label={lightbox.name}>
          <div style={{ textAlign: "center" }}>
            <img src={lightbox.url} alt={lightbox.name} />
            <div>
              <a href={lightbox.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                Abrir original
              </a>
            </div>
          </div>
        </div>
      )}
      {authorMenu && (
        <Menu
          at={authorMenu.at}
          label={authorMenu.p.display_name}
          onClose={() => setAuthorMenu(null)}
          items={[
            ...(authorMenu.p.id !== me?.id
              ? [{ label: "Mandar mensaje directo", icon: <Icon name="chat" />, onClick: () => void openDm(authorMenu.p.id).catch(fail) }]
              : []),
            { label: `Mencionar a @${authorMenu.p.username}`, icon: <Icon name="at" />, onClick: () => composer.current?.mention(authorMenu.p.username) },
          ]}
        />
      )}
    </section>
  );
}
