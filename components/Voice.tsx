"use client";

import { useMemo } from "react";
import { channelAllows, go, setMicMuted, setSounds, setState, useStore, type State } from "@/lib/store";
import type { Channel, Profile } from "@/lib/types";
import { joinVoice, leaveVoice, setNoiseMode } from "@/lib/voice";
import { Icon } from "./Icon";
import { Avatar } from "./ui";

export type VoiceMember = { p: Profile; muted: boolean; deafened: boolean };

/** Quiénes están en un canal de voz (de la presencia global). */
export function voiceMembers(s: State, channelId: string): VoiceMember[] {
  const out: VoiceMember[] = [];
  for (const [uid, v] of Object.entries(s.voiceIn)) {
    if (v.ch !== channelId) continue;
    const p = s.profiles[uid];
    if (p) out.push({ p, muted: v.muted, deafened: v.deafened });
  }
  // yo apenas entro, antes de que vuelva la presencia
  if (s.voice?.channelId === channelId && s.me && !out.some((m) => m.p.id === s.me!.id)) out.push({ p: s.me, muted: s.micMuted || !s.sounds, deafened: !s.sounds });
  return out.sort((a, b) => a.p.display_name.localeCompare(b.p.display_name));
}

function useVoiceMembers(channelId: string) {
  const voiceIn = useStore((s) => s.voiceIn);
  const profiles = useStore((s) => s.profiles);
  const voice = useStore((s) => s.voice);
  const me = useStore((s) => s.me);
  const micMuted = useStore((s) => s.micMuted);
  const sounds = useStore((s) => s.sounds);
  return useMemo(
    () => voiceMembers({ voiceIn, profiles, voice, me, micMuted, sounds } as State, channelId),
    [voiceIn, profiles, voice, me, micMuted, sounds, channelId],
  );
}

function MuteIcons({ m }: { m: VoiceMember }) {
  if (!m.muted && !m.deafened) return null;
  return (
    <span className="vc-flags">
      {m.muted && <Icon name="micOff" />}
      {m.deafened && <Icon name="headphonesOff" />}
    </span>
  );
}

/** Fila de canal de voz en la barra lateral, con la gente conectada abajo. */
export function VoiceRow({ c, active, owner, onEdit, onPick }: { c: Channel; active: boolean; owner: boolean; onEdit: () => void; onPick: () => void }) {
  const members = useVoiceMembers(c.id);
  const speaking = useStore((s) => s.speaking);
  const inHere = useStore((s) => s.voice?.channelId === c.id);
  const priv = useStore((s) => [c.parent_id, c.id].some((id) => id && (s.overrides[id] ?? []).some((o) => !o.role_id && o.deny.includes("view_channel"))));
  return (
    <>
      <div className={`chan vc-chan${active ? " active" : ""}${inHere ? " joined" : ""}`}>
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
            <li key={m.p.id} className={speaking[m.p.id] ? "speaking" : ""}>
              <button onClick={() => setState({ fullProfile: m.p.id })}>
                <Avatar p={m.p} size="xs" />
                <span className="vc-name">{m.p.display_name}</span>
                <MuteIcons m={m} />
              </button>
            </li>
          ))}
        </ul>
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
  const off = micMuted || !sounds;
  return (
    <section className="chat vc-pane">
      <header className="chat-head">
        <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Abrir navegación">
          <Icon name="menu" />
        </button>
        <Icon name="speaker" className="hash" />
        <h2>{channel.name}</h2>
      </header>
      <div className="vc-stage">
        {members.length ? (
          <div className={`vc-grid n${Math.min(members.length, 9)}`}>
            {members.map((m) => {
              const st = peers[m.p.id];
              return (
                <button key={m.p.id} className={`vc-tile${speaking[m.p.id] ? " speaking" : ""}`} style={{ ["--tile" as string]: m.p.banner_color || m.p.color }} onClick={() => setState({ fullProfile: m.p.id })}>
                  <Avatar p={m.p} size="lg" />
                  <span className="vc-tag">
                    {m.p.display_name}
                    <MuteIcons m={m} />
                  </span>
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
      <div className="vc-controls">
        {here ? (
          <>
            <button className={`vc-btn${off ? " off" : ""}`} onClick={() => setMicMuted(!off)} aria-pressed={off} aria-label={off ? "Activar micrófono" : "Silenciar micrófono"} title={off ? "Activar micrófono" : "Silenciar"}>
              <Icon name={off ? "micOff" : "mic"} />
            </button>
            <NoiseButton className="vc-btn" />
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
