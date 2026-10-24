"use client";

import { ProfilePopout } from "./Profile";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildRows, channelTree, dayLabel, firstUnreadId, friendlyError, timeShort } from "@/lib/chat";
import { typingText, useTyping } from "@/lib/typing";
import { can, fail, jumpToMessage, listPins, loadOlder, nameColor, presenceOf, searchMessages, setState, useStore } from "@/lib/store";
import type { Channel, Message as Msg, Profile } from "@/lib/types";
import { Composer, type ComposerHandle } from "./Composer";
import { Icon } from "./Icon";
import { Message } from "./Message";
import { Avatar, STATUS_LABEL, useEscape } from "./ui";
import { render, parse } from "@/lib/markdown";

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
  const state = useStore((s) => s);
  const canModerate = can(state, channel.server_id, "manage_messages");
  const canEveryone = can(state, channel.server_id, "mention_everyone");
  const colorFor = (uid: string) => nameColor(state, channel.server_id, uid);

  const people = useMemo(() => {
    const ids = isDm ? [peerId, me?.id] : members ?? [];
    return ids.map((id) => (id ? profiles[id] : undefined)).filter((p): p is Profile => !!p);
  }, [isDm, peerId, me?.id, members, profiles]);
  const serverChannels = useMemo(() => (channel.server_id ? channelTree(Object.values(allChannels), channel.server_id).flat : []), [allChannels, channel.server_id]);

  const mentionLabel = useCallback(
    (username: string) => {
      if (username === "everyone") return { label: "everyone", me: !isDm };
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
  const blocked = useStore((s) => s.blocked);
  const lastRead = useStore((s) => s.lastRead[channel.id]);
  const jumpTo = useStore((s) => s.jumpTo);
  const [revealed, setRevealed] = useState<Record<string, true>>({});
  const [pins, setPins] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ q: string; list: Msg[] | null; error?: string } | null>(null);
  const typing = useTyping(channel.id);
  const newId = useMemo(() => firstUnreadId(list, lastRead, me?.id ?? ""), [list, lastRead, me?.id]);
  const newCount = useMemo(() => {
    if (!newId) return 0;
    const i = list.findIndex((m) => m.id === newId);
    return list.slice(i).filter((m) => m.author_id !== me?.id).length;
  }, [list, newId, me?.id]);
  const canPin = isDm || canModerate;
  const scrolledToNew = useRef(false);
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

  // venir desde la búsqueda o los fijados: buscar el mensaje (cargando historial si hace falta)
  useEffect(() => {
    if (!jumpTo || !cm?.loaded) return;
    if (list.some((m) => m.id === jumpTo)) {
      setTimeout(() => jump(jumpTo), 50);
      setState({ jumpTo: null });
    } else if (cm.hasMore && !cm.loading) void loadOlder(channel.id);
    else if (!cm.hasMore) setState({ jumpTo: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, cm?.loaded, cm?.loading, list.length]);

  // al entrar con mensajes nuevos, arrancar en la línea roja
  useEffect(() => {
    if (scrolledToNew.current || !newId || !cm?.loaded) return;
    scrolledToNew.current = true;
    requestAnimationFrame(() => {
      const el = document.getElementById("new-divider");
      if (el && scroller.current && el.offsetTop < scroller.current.scrollHeight - scroller.current.clientHeight) {
        stick.current = false;
        el.scrollIntoView({ block: "center" });
      }
    });
  }, [newId, cm?.loaded]);

  const runSearch = async (q: string) => {
    if (!q.trim()) return setResults(null);
    setResults({ q, list: null });
    const ids = isDm ? [channel.id] : serverChannels.map((c) => c.id);
    try {
      setResults({ q, list: await searchMessages(ids, q) });
    } catch (e) {
      setResults({ q, list: [], error: friendlyError(e) });
    }
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
        {isDm ? <Avatar p={peer} size="xs" status={peer ? presenceOf(state, peer.id) : undefined} /> : <Icon name="hash" className="hash" />}
        <h2>{title}</h2>
        {isDm && peer && <span className="head-status">{peer.custom_status || STATUS_LABEL[presenceOf(state, peer.id)]}</span>}
        {!isDm && channel.topic && <span className="topic">{channel.topic}</span>}
        <span className="spacer" />
        <button
          className={`icon-btn head-btn${pins ? " on" : ""}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPins(pins ? null : { x: r.right, y: r.bottom + 8 });
          }}
          aria-label="Mensajes fijados"
          title="Mensajes fijados"
        >
          <Icon name="pin" />
        </button>
        {!isDm && (
          <button className={`icon-btn head-btn${membersOpen ? " on" : ""}`} onClick={onToggleMembers} aria-pressed={membersOpen} aria-label="Lista de miembros" title="Mostrar lista de miembros (Ctrl+U)">
            <Icon name="users" />
          </button>
        )}
        <form
          className={`head-search${search ? " filled" : ""}`}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(search);
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isDm ? `Buscar` : `Buscar en ${server?.name ?? "el servidor"}`} aria-label="Buscar mensajes" />
          {search ? (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                setSearch("");
                setResults(null);
              }}
            >
              <Icon name="close" />
            </button>
          ) : (
            <Icon name="search" />
          )}
        </form>
      </header>
      {!online && <div className="offline">Sin conexión. Los mensajes nuevos van a aparecer cuando vuelva.</div>}
      {newCount > 0 && lastRead && (
        <div className="new-bar">
          <button className="new-bar-jump" onClick={() => document.getElementById("new-divider")?.scrollIntoView({ block: "center", behavior: "smooth" })}>
            {newCount === 1 ? "1 mensaje nuevo" : `${newCount} mensajes nuevos`} desde las {timeShort(lastRead)}
          </button>
          <button className="new-bar-read" onClick={() => setState((s) => ({ lastRead: { ...s.lastRead, [channel.id]: null } }))}>
            Marcar como leído <Icon name="check" />
          </button>
        </div>
      )}

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
          {rows.map((r, idx) => {
            if (r.kind === "day")
              return (
                <div key={r.key} className="day" role="separator">
                  {dayLabel(r.date)}
                </div>
              );
            const m = r.msg;
            const divider =
              m.id === newId ? (
                <div key={`new-${m.id}`} id="new-divider" className="new-divider" role="separator" aria-label="Mensajes nuevos">
                  <span>NUEVOS</span>
                </div>
              ) : null;
            if (blocked[m.author_id] && !revealed[m.author_id]) {
              // un solo aviso por tanda de mensajes bloqueados seguidos
              const prev = rows[idx - 1];
              if (prev?.kind === "msg" && prev.msg.author_id === m.author_id) return divider;
              let n = 0;
              for (let k = idx; k < rows.length; k++) {
                const x = rows[k];
                if (x.kind !== "msg" || x.msg.author_id !== m.author_id) break;
                n++;
              }
              return (
                <div key={r.key}>
                  {divider}
                  <div className="blocked-msg">
                    <Icon name="close" /> {n === 1 ? "1 mensaje bloqueado" : `${n} mensajes bloqueados`} —{" "}
                    <button onClick={() => setRevealed((v) => ({ ...v, [m.author_id]: true }))}>Mostrar</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={r.key} style={{ display: "contents" }}>
                {divider}
                <Message
                  m={m}
                  head={r.head || m.id === newId}
                  me={me?.id ?? ""}
                  canModerate={canModerate}
                  canPin={canPin}
                  author={profiles[m.author_id]}
                  authorColor={colorFor(m.author_id)}
                  reactions={reactions[m.id] ?? EMPTY}
                  editing={editing === m.id}
                  onEdit={(on) => setEditing(on ? m.id : null)}
                  onReply={() => setReplyTo(m)}
                  onJump={jump}
                  onAuthor={(p, at) => setAuthorMenu({ p, at })}
                  onImage={(url, name) => setLightbox({ url, name })}
                  mentionLabel={mentionLabel}
                />
              </div>
            );
          })}
        </div>
      </div>

      {isDm && peer && blocked[peer.id] ? (
        <div className="composer blocked-composer">
          <div className="composer-box">No podés mandarle mensajes a un usuario que bloqueaste.</div>
        </div>
      ) : (
      <Composer
        ref={composer}
        channelId={channel.id}
        placeholder={isDm ? `Mensaje para @${peer?.username ?? "…"}` : `Mensaje en #${channel.name}`}
        people={people}
        everyone={canEveryone && !isDm}
        channels={serverChannels}
        replyTo={replyTo}
        replyAuthor={replyTo ? profiles[replyTo.author_id] : undefined}
        onCancelReply={() => setReplyTo(null)}
        onEditLast={editLast}
        onTyping={typing.notify}
      />
      )}
      <div className="typing" aria-live="polite">
        {typing.typers.length > 0 && (
          <>
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              {(() => {
                const names = typing.typers.map((id) => profiles[id]?.display_name ?? "Alguien");
                const t = typingText(names);
                const b = names.slice(0, 3);
                // nombres en negrita como en Discord
                return t.split(new RegExp(`(${b.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`)).map((part, i) => (b.includes(part) ? <b key={i}>{part}</b> : part));
              })()}
            </span>
          </>
        )}
      </div>

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
      {pins && <PinsPopout channelId={channel.id} at={pins} onClose={() => setPins(null)} mentionLabel={mentionLabel} />}
      {results && (
        <SearchPanel
          q={results.q}
          list={results.list}
          error={results.error}
          onClose={() => {
            setResults(null);
          }}
          mentionLabel={mentionLabel}
        />
      )}
      {authorMenu && (
        <ProfilePopout
          p={authorMenu.p}
          at={authorMenu.at}
          serverId={channel.server_id ?? undefined}
          onClose={() => setAuthorMenu(null)}
          actions={[{ label: "Mencionar", onClick: () => composer.current?.mention(authorMenu.p.username) }]}
        />
      )}
    </section>
  );
}

/* ---------- fijados ---------- */

function MiniMessage({ m, mentionLabel, onClick }: { m: Msg; mentionLabel: (u: string) => { label: string; me: boolean } | null; onClick?: () => void }) {
  const author = useStore((s) => s.profiles[m.author_id]);
  const ch = useStore((s) => s.channels[m.channel_id]);
  return (
    <button className="mini-msg" onClick={onClick}>
      <Avatar p={author} size="sm" />
      <span className="mini-body">
        <span className="mini-meta">
          <b>{author?.display_name ?? "…"}</b>
          {ch && ch.kind !== "dm" && <span className="mini-ch">#{ch.name}</span>}
          <time>{new Date(m.created_at).toLocaleString("es-AR", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
        </span>
        <span className="mini-text">{m.content ? render(parse(m.content.slice(0, 400)), { mentionLabel }) : <i>Imagen</i>}</span>
      </span>
    </button>
  );
}

function PinsPopout({ channelId, at, onClose, mentionLabel }: { channelId: string; at: { x: number; y: number }; onClose: () => void; mentionLabel: (u: string) => { label: string; me: boolean } | null }) {
  const [list, setList] = useState<Msg[] | null>(null);
  const pinnedNow = useStore((s) => (s.messages[channelId]?.list ?? []).filter((m) => m.pinned_at).map((m) => m.id).join(","));
  useEscape(onClose);
  useEffect(() => {
    listPins(channelId).then(setList, (e) => {
      fail(e);
      setList([]);
    });
  }, [channelId, pinnedNow]);
  return (
    <>
      <div className="backdrop" onPointerDown={onClose} />
      <div className="pins-pop" role="dialog" aria-label="Mensajes fijados" style={{ right: Math.max(8, window.innerWidth - at.x), top: at.y }}>
        <header>
          <Icon name="pin" /> Mensajes fijados
        </header>
        <div className="pins-list">
          {!list ? (
            <p className="hint pad">Cargando…</p>
          ) : !list.length ? (
            <div className="pins-empty">
              <div className="pins-empty-art" aria-hidden="true">
                <Icon name="pin" />
              </div>
              <p>Este canal no tiene mensajes fijados… todavía.</p>
              <small>Pasá el mouse por un mensaje y tocá el alfiler para fijarlo.</small>
            </div>
          ) : (
            list.map((m) => (
              <MiniMessage
                key={m.id}
                m={m}
                mentionLabel={mentionLabel}
                onClick={() => {
                  onClose();
                  jumpToMessage(m);
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- resultados de búsqueda ---------- */

function SearchPanel({ q, list, error, onClose, mentionLabel }: { q: string; list: Msg[] | null; error?: string; onClose: () => void; mentionLabel: (u: string) => { label: string; me: boolean } | null }) {
  useEscape(onClose);
  return (
    <aside className="search-panel" aria-label="Resultados de búsqueda">
      <header>
        <span>{list ? `${list.length === 25 ? "25+" : list.length} resultados` : "Buscando…"}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar resultados">
          <Icon name="close" />
        </button>
      </header>
      <div className="search-results">
        {error && <p className="err pad">{error}</p>}
        {list && !list.length && !error && (
          <div className="pins-empty">
            <div className="pins-empty-art" aria-hidden="true">
              <Icon name="search" />
            </div>
            <p>No encontramos nada para «{q}».</p>
            <small>Probá con otras palabras o con de:@usuario.</small>
          </div>
        )}
        {list?.map((m) => (
          <MiniMessage key={m.id} m={m} mentionLabel={mentionLabel} onClick={() => jumpToMessage(m)} />
        ))}
      </div>
    </aside>
  );
}
