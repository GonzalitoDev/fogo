"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { can, channelAllows, deleteChannel, fail, go, linkTo, setBotsListen, setMicMuted, setVoiceMod, toast, setSounds, setState, useStore, voiceModOf, type State } from "@/lib/store";
import { friendlyError } from "@/lib/chat";
import type { Channel, Profile } from "@/lib/types";
import { joinVoice, leaveVoice, moveMember, screenSupported, setNoiseMode, startScreenShare, stopScreenShare } from "@/lib/voice";
import { listenSupported } from "@/lib/botListen";
import { addTrack, pause, searchMusic, setMusicVolume, skip, stopMusic } from "@/lib/music";
import type { MusicTrack } from "@/lib/store";
import { Icon } from "./Icon";
import { Avatar, Confirm, copyText, Menu, type MenuItem } from "./ui";
import { BotTag } from "./Permissions";

export type VoiceMember = { p: Profile; muted: boolean; deafened: boolean; srvMuted?: boolean; srvDeafened?: boolean; screen?: boolean };

/** Quiénes están en un canal de voz (de la presencia global). */
export function voiceMembers(s: State, channelId: string): VoiceMember[] {
  const out: VoiceMember[] = [];
  const sid = s.channels?.[channelId]?.server_id;
  for (const [uid, v] of [...Object.entries(s.voiceIn), ...Object.entries(s.botVoice ?? {})]) {
    if (v.ch !== channelId) continue;
    const p = s.profiles[uid];
    const mod = sid ? s.voiceMods?.[sid]?.[uid] : undefined;
    if (p) out.push({ p, muted: v.muted, deafened: v.deafened, srvMuted: !!mod?.muted, srvDeafened: !!mod?.deafened, screen: !!(v as { screen?: boolean }).screen });
  }
  // yo apenas entro, antes de que vuelva la presencia
  if (s.voice?.channelId === channelId && s.me && !out.some((m) => m.p.id === s.me!.id)) out.push({ p: s.me, muted: s.micMuted || !s.sounds, deafened: !s.sounds });
  // mi pantalla la sé al toque, sin esperar la presencia
  const mine = out.find((m) => m.p.id === s.me?.id);
  if (mine && s.voice?.channelId === channelId) mine.screen = !!s.localScreen;
  return out.sort((a, b) => a.p.display_name.localeCompare(b.p.display_name));
}

function useVoiceMembers(channelId: string) {
  const voiceIn = useStore((s) => s.voiceIn);
  const profiles = useStore((s) => s.profiles);
  const voice = useStore((s) => s.voice);
  const me = useStore((s) => s.me);
  const micMuted = useStore((s) => s.micMuted);
  const sounds = useStore((s) => s.sounds);
  const botVoice = useStore((s) => s.botVoice);
  const voiceMods = useStore((s) => s.voiceMods);
  const channels = useStore((s) => s.channels);
  const localScreen = useStore((s) => s.localScreen);
  return useMemo(
    () => voiceMembers({ voiceIn, botVoice, profiles, voice, me, micMuted, sounds, voiceMods, channels, localScreen } as State, channelId),
    [voiceIn, botVoice, profiles, voice, me, micMuted, sounds, voiceMods, channels, localScreen, channelId],
  );
}

function MuteIcons({ m }: { m: VoiceMember }) {
  if (!m.muted && !m.deafened && !m.srvMuted && !m.srvDeafened) return null;
  return (
    <span className="vc-flags">
      {(m.muted || m.srvMuted) && <Icon name="micOff" className={m.srvMuted ? "srv" : undefined} />}
      {(m.deafened || m.srvDeafened) && <Icon name="headphonesOff" className={m.srvDeafened ? "srv" : undefined} />}
    </span>
  );
}

/** Fila de canal de voz en la barra lateral, con la gente conectada abajo. */
export function VoiceRow({ c, active, owner, onEdit, onPick }: { c: Channel; active: boolean; owner: boolean; onEdit: () => void; onPick: () => void }) {
  const members = useVoiceMembers(c.id);
  const speaking = useStore((s) => s.speaking);
  const inHere = useStore((s) => s.voice?.channelId === c.id);
  const priv = useStore((s) => [c.parent_id, c.id].some((id) => id && (s.overrides[id] ?? []).some((o) => !o.role_id && o.deny.includes("view_channel"))));
  const channels = useStore((s) => s.channels);
  const targets = useMemo(
    () =>
      Object.values(channels)
        .filter((x) => x.kind === "voice" && x.server_id === c.server_id && x.id !== c.id)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [channels, c.server_id, c.id],
  );
  const st = useStore((s) => s);
  const sid = c.server_id ?? "";
  const canMove = can(st, sid, "move_members") && targets.length > 0;
  const canMute = can(st, sid, "mute_members");
  const canDeaf = can(st, sid, "deafen_members");
  const canMenu = canMove || canMute || canDeaf;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; uid: string } | null>(null);
  const [chanMenu, setChanMenu] = useState<{ x: number; y: number } | null>(null);
  const [del, setDel] = useState(false);
  const chanItems: MenuItem[] = [
    { label: "Unirse a la voz", icon: <Icon name="speaker" />, onClick: onPick },
    { label: "Copiar link", icon: <Icon name="link" />, onClick: () => void copyText(linkTo(c.id)).then((ok) => toast(ok ? "Link copiado" : "No se pudo copiar el link", ok ? "info" : "error")) },
    ...(owner
      ? ([
          "sep",
          { label: "Editar canal", icon: <Icon name="gear" />, onClick: onEdit },
          { label: "Eliminar canal", icon: <Icon name="trash" />, danger: true, onClick: () => setDel(true) },
        ] as MenuItem[])
      : []),
  ];
  return (
    <>
      <div
        className={`chan vc-chan${active ? " active" : ""}${inHere ? " joined" : ""}${over ? " drop" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setChanMenu({ x: e.clientX, y: e.clientY });
        }}
        onDragOver={
          canMove
            ? (e) => {
                if (!e.dataTransfer.types.includes("text/plain")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(true);
              }
            : undefined
        }
        onDragLeave={canMove ? (e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false) : undefined}
        onDrop={
          canMove
            ? (e) => {
                e.preventDefault();
                setOver(false);
                const uid = e.dataTransfer.getData("text/plain");
                if (uid && !members.some((m) => m.p.id === uid)) void moveMember(uid, c.id);
              }
            : undefined
        }
      >
        <span className="hash-wrap">
          <Icon name="speaker" className="hash" />
          {priv && <Icon name="lock" className="hash-lock" />}
        </span>
        <button className="label" onClick={onPick} aria-current={active ? "page" : undefined} aria-label={`Canal de voz ${c.name}${members.length ? `, ${members.length} conectados` : ""}`}>
          {c.name}
        </button>
        {owner && (
          <button className="icon-btn" onClick={onEdit} aria-label={`Editar ${c.name}`} title="Editar canal">
            <Icon name="gear" />
          </button>
        )}
      </div>
      {members.length > 0 && (
        <ul className="vc-roster" aria-label={`Conectados a ${c.name}`}>
          {members.map((m) => (
            <li
              key={m.p.id}
              className={`${speaking[m.p.id] ? "speaking" : ""}${drag === m.p.id ? " dragging" : ""}`.trim() || undefined}
              draggable={canMove}
              onDragStart={
                canMove
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", m.p.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDrag(m.p.id);
                    }
                  : undefined
              }
              onDragEnd={canMove ? () => setDrag(null) : undefined}
              onContextMenu={
                canMenu
                  ? (e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, uid: m.p.id });
                    }
                  : undefined
              }
            >
              <button className="vc-person" onClick={() => setState({ fullProfile: m.p.id })} title={canMove ? `Arrastrá a ${m.p.display_name} a otro canal de voz` : undefined}>
                <Avatar p={m.p} size="xs" />
                <span className="vc-name">{m.p.display_name}</span>
                {m.p.is_bot && <BotTag official={m.p.is_official} />}
                {m.screen && <span className="live-pill">EN VIVO</span>}
                <MuteIcons m={{ ...m, muted: m.muted && !speaking[m.p.id] }} />
              </button>
              {canMenu && (
                <button
                  className="icon-btn vc-more"
                  title="Opciones de voz"
                  aria-label={`Opciones de voz para ${m.p.display_name}`}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ x: r.left, y: r.bottom + 6, uid: m.p.id });
                  }}
                >
                  <Icon name="dots" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {menu && (
        <Menu
          label="Opciones de voz"
          at={menu}
          onClose={() => setMenu(null)}
          items={(() => {
            const mod = voiceModOf(st, sid, menu.uid);
            const run = (patch: { muted?: boolean; deafened?: boolean }) => setVoiceMod(sid, menu.uid, patch).catch((e) => toast(friendlyError(e), "error"));
            const items: MenuItem[] = [];
            if (canMute) items.push({ label: mod.muted ? "Quitar silencio del servidor" : "Silenciar en el servidor", icon: <Icon name="micOff" />, danger: !mod.muted, onClick: () => void run({ muted: !mod.muted }) });
            if (canDeaf) items.push({ label: mod.deafened ? "Quitar ensordecido del servidor" : "Ensordecer en el servidor", icon: <Icon name="headphonesOff" />, danger: !mod.deafened, onClick: () => void run({ deafened: !mod.deafened }) });
            if (canMove) {
              if (items.length) items.push("sep");
              items.push(...targets.map((t) => ({ label: `Mover a ${t.name}`, icon: <Icon name="speaker" />, onClick: () => void moveMember(menu.uid, t.id) })));
            }
            return items;
          })()}
        />
      )}
      {chanMenu && <Menu label={`Opciones de ${c.name}`} at={chanMenu} onClose={() => setChanMenu(null)} items={chanItems} />}
      {del && (
        <Confirm
          title={`Eliminar ${c.name}`}
          text="Se borra el canal de voz. Si hay gente conectada, se desconecta."
          action="Eliminar"
          danger
          onConfirm={() => deleteChannel(c.id).then(() => toast("Canal eliminado")).catch(fail)}
          onClose={() => setDel(false)}
        />
      )}
    </>
  );
}

/** "Voz conectada" arriba del panel de usuario. */
export function VoiceConnected() {
  const voice = useStore((s) => s.voice);
  const ch = useStore((s) => (s.voice ? s.channels[s.voice.channelId] : undefined));
  const server = useStore((s) => (s.voice ? s.servers[s.voice.serverId] : undefined));
  const peers = useStore((s) => s.voicePeers);
  const ping = useStore((s) => s.voicePing);
  const relay = useStore((s) => s.voiceRelay);
  if (!voice || !ch) return null;
  const vals = Object.values(peers);
  const bad = vals.includes("failed");
  const connecting = voice.status === "connecting" || vals.includes("connecting");
  return (
    <div className="vc-panel">
      <div className="vc-panel-info">
        <b className={bad ? "bad" : connecting ? "wait" : ""}>
          <Icon name="signal" /> {bad ? "Problemas de conexión" : connecting ? "Conectando…" : "Voz conectada"}
          {!bad && !connecting && ping !== null && (
            <span className={`vc-ping ${ping < 100 ? "good" : ping < 250 ? "mid" : "slow"}`} title="Latencia de ida y vuelta con los demás">
              {ping} ms
            </span>
          )}
          {relay && !connecting && (
            <span className="vc-shield" title="IP protegida: la llamada pasa por un servidor seguro, nadie ve tu IP">
              <Icon name="shield" />
            </span>
          )}
        </b>
        <button className="vc-where" onClick={() => go({ kind: "server", serverId: voice.serverId, channelId: voice.channelId })} title="Ir al canal">
          {ch.name} / {server?.name}
        </button>
      </div>
      <NoiseButton className="icon-btn" />
      <button className="icon-btn vc-leave" onClick={() => void leaveVoice()} aria-label="Desconectarse" title="Desconectarse">
        <Icon name="hangup" />
      </button>
    </div>
  );
}

/** "Los bots me escuchan": tu voz se pasa a texto para que los bots de la llamada te contesten. */
function ListenButton() {
  const on = useStore((s) => s.botsListen);
  return (
    <button
      className={`vc-btn listen-btn${on ? " on" : ""}`}
      onClick={() => {
        if (!on) toast("Los bots te van a contestar cuando hables. Tu voz se pasa a texto con el reconocimiento del navegador (en Chrome lo procesa Google).");
        setBotsListen(!on);
      }}
      aria-pressed={on}
      aria-label={on ? "Los bots te escuchan: activado" : "Que los bots me escuchen y contesten"}
      title={on ? "Los bots te escuchan (tocá para apagar)" : "Que los bots me escuchen y contesten"}
    >
      <Icon name="bot" />
    </button>
  );
}

/** Prende / apaga la supresión de ruido con IA (como el botón de Krisp en Discord). */
export function NoiseButton({ className }: { className: string }) {
  const mode = useStore((s) => s.noiseMode);
  const on = mode === "ia";
  return (
    <button
      className={`${className} noise-btn${on ? " on" : ""}`}
      onClick={() => void setNoiseMode(on ? "navegador" : "ia")}
      aria-pressed={on}
      aria-label={on ? "Supresión de ruido con IA: activada" : "Supresión de ruido con IA: desactivada"}
      title={on ? "Supresión de ruido con IA activada" : "Activar supresión de ruido con IA"}
    >
      <Icon name="noise" />
    </button>
  );
}

export function MicButton() {
  const micMuted = useStore((s) => s.micMuted);
  const sounds = useStore((s) => s.sounds);
  const off = micMuted || !sounds;
  return (
    <button className={`icon-btn${off ? " off" : ""}`} onClick={() => setMicMuted(!off)} aria-pressed={off} aria-label={off ? "Activar micrófono" : "Silenciar micrófono"} title={off ? "Activar micrófono" : "Silenciar"}>
      <Icon name={off ? "micOff" : "mic"} />
    </button>
  );
}

/** Pantalla de un canal de voz: la grilla de gente y los controles. */
export function VoicePane({ channel, onMenu }: { channel: Channel; onMenu: () => void }) {
  const members = useVoiceMembers(channel.id);
  const speaking = useStore((s) => s.speaking);
  const voice = useStore((s) => s.voice);
  const micMuted = useStore((s) => s.micMuted);
  const sounds = useStore((s) => s.sounds);
  const peers = useStore((s) => s.voicePeers);
  const canView = useStore((s) => channelAllows(s, channel.id, "view_channel"));
  const here = voice?.channelId === channel.id;
  const caption = useStore((s) => s.voiceCaption);
  const botsHere = members.some((m) => m.p.is_bot);
  const [musicOpen, setMusicOpen] = useState(false);
  const off = micMuted || !sounds;
  const me = useStore((s) => s.me);
  const screens = useStore((s) => s.screens);
  const localScreen = useStore((s) => s.localScreen);
  const canVideo = useStore((s) => channelAllows(s, channel.id, "video"));
  const sharers = members.filter((m) => m.screen).map((m) => m.p);
  const [focus, setFocus] = useState<string | null>(null);
  const focused = sharers.find((p) => p.id === focus)?.id ?? sharers[0]?.id ?? null;
  return (
    <section className="chat vc-pane">
      <header className="chat-head">
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Abrir navegación">
          <Icon name="menu" />
        </button>
        <Icon name="speaker" className="hash" />
        <h2>{channel.name}</h2>
      </header>
      <div className={`vc-stage${sharers.length ? " has-screen" : ""}`}>
        {sharers.length > 0 && (
          <ScreenStage
            sharers={sharers}
            focus={focused}
            onFocus={setFocus}
            streamOf={(uid) => (uid === me?.id ? localScreen : screens[uid]) ?? null}
            here={here}
          />
        )}
        {members.length ? (
          <div className={`vc-grid n${Math.min(members.length, 9)}${sharers.length ? " mini" : ""}`}>
            {members.map((m) => {
              const st = peers[m.p.id];
              return (
                <button key={m.p.id} className={`vc-tile${speaking[m.p.id] ? " speaking" : ""}`} style={{ ["--tile" as string]: m.p.banner_color || m.p.color }} onClick={() => setState({ fullProfile: m.p.id })}>
                  <Avatar p={m.p} size="lg" />
                  <span className="vc-tag">
                    {m.p.display_name}
                    {m.p.is_bot && <BotTag official={m.p.is_official} />}
                    <MuteIcons m={{ ...m, muted: m.muted && !speaking[m.p.id] }} />
                  </span>
                  {m.p.is_bot && /^(🎮|🎵|⏸️)/u.test(m.p.custom_status ?? "") && <span className="vc-activity">{m.p.custom_status}</span>}
                  {here && caption?.botId === m.p.id && <span className="vc-caption">{caption.text}</span>}
                  {here && st && st !== "connected" && <span className="vc-state">{st === "failed" ? "Sin conexión" : "Conectando…"}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="vc-empty">
            <div className="vc-empty-ico">
              <Icon name="speaker" />
            </div>
            <h2>{channel.name}</h2>
            <p>No hay nadie todavía. Entrá y esperá a que se sumen tus amigos.</p>
          </div>
        )}
      </div>
      <NowPlaying channelId={channel.id} here={here} onOpen={() => setMusicOpen(true)} />
      {musicOpen && here && <MusicPanel channelId={channel.id} onClose={() => setMusicOpen(false)} />}
      <div className="vc-controls">
        {here ? (
          <>
            <button className={`vc-btn${off ? " off" : ""}`} onClick={() => setMicMuted(!off)} aria-pressed={off} aria-label={off ? "Activar micrófono" : "Silenciar micrófono"} title={off ? "Activar micrófono" : "Silenciar"}>
              <Icon name={off ? "micOff" : "mic"} />
            </button>
            <NoiseButton className="vc-btn" />
            {screenSupported() && (
              <button
                className={`vc-btn screen-btn${localScreen ? " on" : ""}`}
                disabled={!canVideo && !localScreen}
                onClick={() => void (localScreen ? stopScreenShare() : startScreenShare())}
                aria-pressed={!!localScreen}
                aria-label={localScreen ? "Dejar de compartir pantalla" : "Compartir pantalla"}
                title={!canVideo ? "No tenés permiso de Video en este canal" : localScreen ? "Dejar de compartir pantalla" : "Compartir pantalla"}
              >
                <Icon name={localScreen ? "screenOff" : "screen"} />
              </button>
            )}
            {botsHere && listenSupported() && <ListenButton />}
            <button className={`vc-btn music-btn${musicOpen ? " on" : ""}`} onClick={() => setMusicOpen((o) => !o)} aria-pressed={musicOpen} aria-label="Música" title="Música (bot Temazo)">
              <Icon name="music" />
            </button>
            <button className={`vc-btn${!sounds ? " off" : ""}`} onClick={() => setSounds(!sounds)} aria-pressed={!sounds} aria-label={sounds ? "Ensordecer" : "Dejar de ensordecer"} title={sounds ? "Ensordecer" : "Dejar de ensordecer"}>
              <Icon name={sounds ? "headphones" : "headphonesOff"} />
            </button>
            <button className="vc-btn hang" onClick={() => void leaveVoice()} aria-label="Desconectarse" title="Desconectarse">
              <Icon name="hangup" />
            </button>
          </>
        ) : (
          <button className="btn vc-join" disabled={!canView} onClick={() => void joinVoice(channel.id)}>
            <Icon name="speaker" /> Unirse a la voz
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- bot de música ---------- */

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Lo que está sonando (se ve aunque no estés en la llamada). */
function NowPlaying({ channelId, here, onOpen }: { channelId: string; here: boolean; onOpen: () => void }) {
  const ms = useStore((s) => s.music[channelId]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const cur = ms?.current;
  if (!cur || !ms.started_at) return null;
  const end = ms.paused_at ? new Date(ms.paused_at).getTime() : Date.now();
  const pos = Math.min(cur.duration, Math.max(0, (end - new Date(ms.started_at).getTime()) / 1000));
  return (
    <div className="np-bar">
      {cur.art ? <img src={cur.art} alt="" /> : <span className="np-art" />}
      <div className="np-info">
        <b>{cur.title}</b>
        <span>
          {cur.artist}
          {cur.by ? ` · pedido por @${cur.by}` : ""}
        </span>
        <div className="np-prog" aria-label={`${fmt(pos)} de ${fmt(cur.duration)}`}>
          <i style={{ width: `${cur.duration ? (pos / cur.duration) * 100 : 0}%` }} />
        </div>
      </div>
      <span className="np-time">
        {fmt(pos)} / {fmt(cur.duration)}
      </span>
      {here && (
        <div className="np-ctrl">
          <button onClick={() => void pause(channelId, !ms.paused_at)} aria-label={ms.paused_at ? "Seguir" : "Pausar"} title={ms.paused_at ? "Seguir" : "Pausar"}>
            <Icon name={ms.paused_at ? "play" : "pause"} />
          </button>
          <button onClick={() => void skip(channelId)} aria-label="Siguiente" title="Siguiente">
            <Icon name="skip" />
          </button>
          <button onClick={onOpen} aria-label="Cola y buscar" title="Cola y buscar">
            <Icon name="list" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Buscar temas, ver la cola, volumen. */
function MusicPanel({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const ms = useStore((s) => s.music[channelId]);
  const vol = useStore((s) => s.musicVolume);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<MusicTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Record<string, true>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = (text: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setRes(await searchMusic(text, 15));
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    }, 350);
  };
  useEffect(() => run(""), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="music-panel" aria-label="Música">
      <header>
        <b>
          <Icon name="music" /> Temazo
        </b>
        <span className="hint">música libre de Audius</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar música">
          <Icon name="close" />
        </button>
      </header>
      <input
        className="input"
        placeholder="Buscá un tema, artista o género"
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          run(e.target.value);
        }}
        aria-label="Buscar música"
      />
      <h4>{q.trim() ? "Resultados" : "Lo más escuchado ahora"}</h4>
      <div className="music-list">
        {busy && !res && <p className="hint">Buscando…</p>}
        {res?.length === 0 && <p className="hint">No encontré nada.</p>}
        {res?.map((t) => (
          <div key={t.id} className="music-row">
            {t.art ? <img src={t.art} alt="" /> : <span className="np-art" />}
            <span className="music-txt">
              <b>{t.title}</b>
              <span>
                {t.artist} · {fmt(t.duration)}
              </span>
            </span>
            <button
              className={`btn ${added[t.id] ? "" : "primary"}`}
              disabled={!!added[t.id]}
              onClick={() => {
                setAdded((a) => ({ ...a, [t.id]: true }));
                void addTrack(channelId, t);
              }}
            >
              {added[t.id] ? "✓" : ms?.current ? "+ Cola" : "▶ Poner"}
            </button>
          </div>
        ))}
      </div>
      {!!ms?.queue?.length && (
        <>
          <h4>En la cola ({ms.queue.length})</h4>
          <ol className="music-queue">
            {ms.queue.map((t, i) => (
              <li key={t.id + i}>
                <b>{t.title}</b> — {t.artist}
              </li>
            ))}
          </ol>
        </>
      )}
      <footer>
        <label className="music-vol">
          <Icon name="speaker" />
          <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setMusicVolume(Number(e.target.value))} aria-label="Volumen de la música" />
        </label>
        {ms?.current && (
          <button className="btn danger" onClick={() => void stopMusic(channelId)}>
            Parar todo
          </button>
        )}
      </footer>
      <p className="hint music-help">También desde el chat: !play tema · !skip · !pausa · !sigue · !stop · !cola</p>
    </aside>
  );
}

/** Video de una pantalla compartida (siempre sin sonido: el audio va por la voz). */
function ScreenVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted />;
}

/** Transmisiones en vivo del canal: la elegida en grande y las demás para cambiar. */
function ScreenStage({ sharers, focus, onFocus, streamOf, here }: { sharers: Profile[]; focus: string | null; onFocus: (id: string) => void; streamOf: (uid: string) => MediaStream | null; here: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const main = sharers.find((p) => p.id === focus) ?? sharers[0];
  const stream = main ? streamOf(main.id) : null;
  if (!main) return null;
  return (
    <div className="screen-stage">
      <div className="screen-main" ref={box}>
        {!here ? (
          <div className="screen-wait">Entrá a la voz para ver la transmisión de {main.display_name}.</div>
        ) : stream ? (
          <ScreenVideo stream={stream} />
        ) : (
          <div className="screen-wait">Conectando con la transmisión…</div>
        )}
        <span className="screen-label">
          <span className="live-pill">EN VIVO</span> {main.display_name}
        </span>
        {here && stream && (
          <button
            className="icon-btn screen-full"
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void box.current?.requestFullscreen?.())}
            aria-label="Pantalla completa"
            title="Pantalla completa"
          >
            <Icon name="expand" />
          </button>
        )}
      </div>
      {sharers.length > 1 && (
        <div className="screen-thumbs">
          {sharers.map((p) => (
            <button key={p.id} className={p.id === main.id ? "on" : ""} onClick={() => onFocus(p.id)}>
              <span className="live-pill">EN VIVO</span> {p.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
