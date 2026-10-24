"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getState, retrackPresence, setState, subscribe, toast } from "./store";

/*
 * Canales de voz: WebRTC de a pares (malla). Cada canal de voz tiene un canal
 * privado de Realtime "fogon-voice:<id>" que sirve para dos cosas:
 *  - presencia: quién está conectado a la llamada (para armar las conexiones)
 *  - broadcast: señalización (offer / answer / ice) dirigida a una persona
 * El audio va directo entre navegadores; Supabase solo pasa los mensajes.
 * De cada par, el que tiene el id más chico es el que llama (así nunca llaman los dos).
 */

const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

type Sig =
  | { from: string; to: string; type: "offer" | "answer"; sdp: string }
  | { from: string; to: string; type: "ice"; candidate: RTCIceCandidateInit };

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[]; stopMeter?: () => void };

let chan: RealtimeChannel | null = null;
let local: MediaStream | null = null;
let stopLocalMeter: (() => void) | undefined;
const peers = new Map<string, Peer>();
let actx: AudioContext | null = null;
let joinSeq = 0;

const meId = () => getState().session?.user.id ?? "";

/* ---------- utilidades ---------- */

function setPeerState(uid: string, st: "connecting" | "connected" | "failed" | null) {
  setState((s) => {
    const voicePeers = { ...s.voicePeers };
    if (st) voicePeers[uid] = st;
    else delete voicePeers[uid];
    return { voicePeers };
  });
}

function setSpeaking(uid: string, on: boolean) {
  const cur = !!getState().speaking[uid];
  if (cur === on) return;
  setState((s) => {
    const speaking = { ...s.speaking };
    if (on) speaking[uid] = true;
    else delete speaking[uid];
    return { speaking };
  });
}

/** Mide el volumen de un stream y marca "hablando" (borde verde). */
function meter(stream: MediaStream, uid: string): () => void {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    const src = actx.createMediaStreamSource(stream);
    const an = actx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let quietSince = 0;
    const t = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) * (v - 128);
      const rms = Math.sqrt(sum / buf.length);
      const muted = uid === meId() && (getState().micMuted || !getState().sounds);
      if (rms > 6 && !muted) {
        quietSince = 0;
        setSpeaking(uid, true);
      } else {
        // que no parpadee entre palabras
        if (!quietSince) quietSince = Date.now();
        if (Date.now() - quietSince > 300) setSpeaking(uid, false);
      }
    }, 80);
    return () => {
      clearInterval(t);
      try {
        src.disconnect();
      } catch {}
      setSpeaking(uid, false);
    };
  } catch {
    return () => {};
  }
}

function send(msg: Sig) {
  void chan?.send({ type: "broadcast", event: "sig", payload: msg });
}

function applyLocalMute() {
  const s = getState();
  const off = s.micMuted || !s.sounds;
  local?.getAudioTracks().forEach((t) => (t.enabled = !off));
  for (const p of peers.values()) p.audio.muted = !s.sounds;
}

/* ---------- conexiones ---------- */

function peerFor(uid: string): Peer {
  let p = peers.get(uid);
  if (p) return p;
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const audio = new Audio();
  audio.autoplay = true;
  audio.muted = !getState().sounds;
  p = { pc, audio, pending: [] };
  peers.set(uid, p);
  setPeerState(uid, "connecting");
  local?.getTracks().forEach((t) => pc.addTrack(t, local!));
  pc.onicecandidate = (e) => {
    if (e.candidate) send({ from: meId(), to: uid, type: "ice", candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream;
    void audio.play().catch(() => {});
    const peer = peers.get(uid);
    if (peer) {
      peer.stopMeter?.();
      peer.stopMeter = meter(stream, uid);
    }
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "connected") setPeerState(uid, "connected");
    else if (st === "failed") {
      setPeerState(uid, "failed");
      // un reintento: el que llama vuelve a ofrecer con ICE nuevo
      if (meId() < uid) void call(uid, true);
    }
  };
  return p;
}

function dropPeer(uid: string) {
  const p = peers.get(uid);
  if (!p) return;
  p.stopMeter?.();
  p.pc.close();
  p.audio.srcObject = null;
  peers.delete(uid);
  setPeerState(uid, null);
}

async function call(uid: string, restart = false) {
  const p = peerFor(uid);
  const offer = await p.pc.createOffer(restart ? { iceRestart: true } : undefined);
  await p.pc.setLocalDescription(offer);
  send({ from: meId(), to: uid, type: "offer", sdp: offer.sdp ?? "" });
}

async function onSignal(m: Sig) {
  if (m.to !== meId() || !local) return;
  try {
    if (m.type === "offer") {
      const p = peerFor(m.from);
      await p.pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      send({ from: meId(), to: m.from, type: "answer", sdp: answer.sdp ?? "" });
    } else if (m.type === "answer") {
      const p = peers.get(m.from);
      if (!p || p.pc.signalingState !== "have-local-offer") return;
      await p.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
    } else if (m.type === "ice") {
      const p = peerFor(m.from);
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.candidate).catch(() => {});
      else p.pending.push(m.candidate);
    }
  } catch (e) {
    console.warn("[fogon voz]", e);
  }
}

function syncPeers() {
  if (!chan || !local) return;
  const here = new Set(Object.keys(chan.presenceState()));
  const me = meId();
  for (const uid of here) {
    if (uid === me || peers.has(uid)) continue;
    if (me < uid) void call(uid).catch((e) => console.warn("[fogon voz]", e));
  }
  for (const uid of [...peers.keys()]) if (!here.has(uid)) dropPeer(uid);
}

/* ---------- API ---------- */

export function voiceSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined";
}

export async function joinVoice(channelId: string) {
  const s = getState();
  const ch = s.channels[channelId];
  if (!ch || ch.kind !== "voice" || !ch.server_id) return;
  if (s.voice?.channelId === channelId) return;
  if (!voiceSupported()) return toast("Tu navegador no permite llamadas de voz.", "error");
  await leaveVoice(true);
  const seq = ++joinSeq;
  setState({ voice: { channelId, serverId: ch.server_id, status: "connecting" } });
  try {
    local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) {
    if (seq !== joinSeq) return;
    setState({ voice: null });
    const name = (e as Error)?.name;
    toast(name === "NotAllowedError" ? "Fogón necesita permiso para usar tu micrófono. Habilitalo en el candado de la barra de direcciones." : name === "NotFoundError" ? "No encontramos ningún micrófono." : "No pudimos abrir el micrófono.", "error");
    return;
  }
  if (seq !== joinSeq) {
    local.getTracks().forEach((t) => t.stop());
    return;
  }
  applyLocalMute();
  stopLocalMeter = meter(local, meId());
  chan = supabase.channel(`fogon-voice:${channelId}`, { config: { private: true, broadcast: { self: false }, presence: { key: meId() } } });
  chan
    .on("broadcast", { event: "sig" }, ({ payload }) => void onSignal(payload as Sig))
    .on("presence", { event: "sync" }, syncPeers)
    .subscribe(async (st) => {
      if (seq !== joinSeq) return;
      if (st === "SUBSCRIBED") {
        await chan?.track({ at: Date.now() });
        setState((x) => (x.voice ? { voice: { ...x.voice, status: "connected" } } : {}));
        ping(true);
        retrackPresence();
      } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") {
        toast("No pudimos conectarte al canal de voz.", "error");
        void leaveVoice();
      }
    });
}

export async function leaveVoice(silent = false) {
  joinSeq++;
  const was = !!getState().voice;
  for (const uid of [...peers.keys()]) dropPeer(uid);
  stopLocalMeter?.();
  stopLocalMeter = undefined;
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  if (chan) {
    const c = chan;
    chan = null;
    await c.untrack().catch(() => {});
    void supabase.removeChannel(c);
  }
  if (was) {
    setState({ voice: null, speaking: {}, voicePeers: {} });
    retrackPresence();
    if (!silent) ping(false);
  }
}

/** Sonidito de entrar / salir de la llamada. */
function ping(join: boolean) {
  if (!getState().sounds) return;
  try {
    actx ??= new AudioContext();
    const t = actx.currentTime;
    (join ? [520, 780] : [620, 410]).forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.1 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.16);
      o.connect(g).connect(actx!.destination);
      o.start(t + i * 0.1);
      o.stop(t + i * 0.1 + 0.18);
    });
  } catch {}
}

/* mute / ensordecer cambian en el store: los aplico al audio */
if (typeof window !== "undefined") {
  let last = "";
  subscribe(() => {
    const s = getState();
    const k = `${s.micMuted}|${s.sounds}`;
    if (k !== last) {
      last = k;
      applyLocalMute();
    }
    // me sacaron del servidor o borraron el canal: corto
    if (s.voice && !s.channels[s.voice.channelId]) void leaveVoice();
    if (!s.session && s.voice) void leaveVoice(true);
  });
  window.addEventListener("pagehide", () => void leaveVoice(true));
}
