"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { botSay } from "./botListen";
import { tuneOpus } from "./opus";
import { boostLevel, voiceBitrate } from "./boost";
import { supabase } from "./supabase";
import { channelAllows, channelAllowsFor, getState, retrackPresence, setState, subscribe, toast, voiceModOf } from "./store";

/** Calidad de voz del servidor donde estoy (sube con los boosts). */
function bitrateNow(): number {
  const s = getState();
  const sid = s.voice?.serverId;
  return voiceBitrate(boostLevel(sid ? s.servers[sid]?.boost_count : 0));
}

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

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[]; stopMeter?: () => void; sender?: RTCRtpSender; video?: RTCRtpTransceiver };
export type NoiseMode = "ia" | "navegador" | "off";

let chan: RealtimeChannel | null = null;
let raw: MediaStream | null = null; // micrófono tal cual
let local: MediaStream | null = null; // lo que se manda (ya sin ruido)
let chainOff: (() => void) | undefined;
let stopLocalMeter: (() => void) | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
const peers = new Map<string, Peer>();
let actx: AudioContext | null = null;
let joinSeq = 0;

/* ---------- audio: contexto, supresión de ruido (RNNoise) ---------- */

/** Un solo AudioContext a 48 kHz y en modo "interactivo" (el de menor latencia). */
function audioCtx(): AudioContext {
  if (!actx || actx.state === "closed") {
    try {
      actx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    } catch {
      actx = new AudioContext({ latencyHint: "interactive" });
    }
  }
  if (actx.state === "suspended") void actx.resume();
  return actx;
}

let rnnoiseReady: Promise<ArrayBuffer> | null = null;
let workletCtx: AudioContext | null = null;
// se carga recién cuando hace falta (y nunca en el servidor: extiende AudioWorkletNode)
const suppressor = () => import("@sapphi-red/web-noise-suppressor");
async function rnnoiseFor(ctx: AudioContext): Promise<ArrayBuffer> {
  const { loadRnnoise } = await suppressor();
  rnnoiseReady ??= loadRnnoise({ url: "/voz/rnnoise.wasm", simdUrl: "/voz/rnnoise_simd.wasm" });
  const bin = await rnnoiseReady.catch((e) => {
    rnnoiseReady = null;
    throw e;
  });
  if (workletCtx !== ctx) {
    await ctx.audioWorklet.addModule("/voz/rnnoise-worklet.js");
    workletCtx = ctx;
  }
  return bin;
}

function micConstraints(mode: NoiseMode): MediaTrackConstraints {
  return {
    echoCancellation: true,
    // con la IA prendida apago la del navegador: si no, se pisan y la voz queda robótica
    noiseSuppression: mode === "navegador",
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
    ...({ latency: 0 } as object),
  };
}

/**
 * Arma lo que se manda a la llamada a partir del micrófono:
 *  ia        -> RNNoise (red neuronal, corre en un AudioWorklet en tiempo real, ~10 ms de bloque)
 *  navegador -> la supresión que trae Chrome/Firefox
 *  off       -> el micrófono pelado
 */
export async function processMic(src: MediaStream, mode: NoiseMode): Promise<{ stream: MediaStream; off: () => void; mode: NoiseMode }> {
  if (mode !== "ia") return { stream: new MediaStream(src.getAudioTracks()), off: () => {}, mode };
  try {
    if (typeof AudioWorkletNode === "undefined") throw new Error("sin AudioWorklet");
    const ctx = audioCtx();
    const wasmBinary = await rnnoiseFor(ctx);
    const { RnnoiseWorkletNode } = await suppressor();
    const input = ctx.createMediaStreamSource(src);
    const rn = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    input.connect(rn).connect(dest);
    return {
      stream: dest.stream,
      mode,
      off: () => {
        try {
          input.disconnect();
          rn.disconnect();
          rn.destroy();
        } catch {}
        dest.stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch (e) {
    console.warn("[fogon voz] RNNoise no disponible, uso la del navegador", e);
    src.getAudioTracks().forEach((t) => void t.applyConstraints({ ...t.getConstraints(), noiseSuppression: true }).catch(() => {}));
    return { stream: new MediaStream(src.getAudioTracks()), off: () => {}, mode: "navegador" };
  }
}

/** Cambia la supresión de ruido; si estás en una llamada, el cambio es al toque (sin cortar). */
export async function setNoiseMode(mode: NoiseMode) {
  setState({ noiseMode: mode });
  try {
    localStorage.setItem("fogon:noise", mode);
  } catch {}
  if (!raw) return;
  const seq = joinSeq;
  raw.getAudioTracks().forEach((t) => void t.applyConstraints(micConstraints(mode)).catch(() => {}));
  const next = await processMic(raw, mode);
  if (seq !== joinSeq || !raw) return next.off();
  const track = next.stream.getAudioTracks()[0];
  await Promise.all([...peers.values()].map((p) => p.sender?.replaceTrack(track).catch(() => {})));
  const prevOff = chainOff;
  chainOff = next.off;
  local = next.stream;
  prevOff?.();
  applyLocalMute();
  stopLocalMeter?.();
  stopLocalMeter = meter(local, meId());
  if (next.mode !== mode) {
    setState({ noiseMode: next.mode });
    toast("Tu navegador no soporta la supresión con IA; quedó la del navegador.", "error");
  }
}

/* ---------- latencia ---------- */

async function measurePing() {
  const rtts: number[] = [];
  await Promise.all(
    [...peers.values()].map(async (p) => {
      try {
        const stats = await p.pc.getStats();
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && (r.nominated || r.selected) && typeof r.currentRoundTripTime === "number") rtts.push(r.currentRoundTripTime * 1000);
        });
      } catch {}
    }),
  );
  setState({ voicePing: rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null });
}

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
    const ctx = audioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let quietSince = 0;
    const t = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) * (v - 128);
      const rms = Math.sqrt(sum / buf.length);
      const st = getState();
      const muted = (uid === meId() && (st.micMuted || !st.sounds)) || voiceForced(st, uid).muted;
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

/** Lo que impone el servidor (como Discord): sin permiso de Hablar o silenciado / ensordecido por un moderador. */
export function voiceForced(s = getState(), uid = meId()) {
  const v = s.voice;
  if (!v) return { muted: false, deafened: false, noSpeak: false };
  const mod = voiceModOf(s, v.serverId, uid);
  const noSpeak = !channelAllowsFor(s, uid, v.channelId, "speak");
  return { muted: mod.muted || mod.deafened || noSpeak, deafened: mod.deafened, noSpeak };
}

function applyLocalMute() {
  const s = getState();
  const forced = voiceForced(s);
  const off = s.micMuted || !s.sounds || forced.muted;
  local?.getAudioTracks().forEach((t) => (t.enabled = !off));
  raw?.getAudioTracks().forEach((t) => (t.enabled = !off));
  // a los que el servidor silenció no se los escucha (aunque su navegador mande audio)
  for (const [uid, p] of peers) p.audio.muted = !s.sounds || forced.deafened || voiceForced(s, uid).muted;
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
  const track = local?.getAudioTracks()[0];
  if (track) {
    p.sender = pc.addTrack(track, local!);
    // la voz primero: prioridad alta en la red
    const params = p.sender.getParameters();
    if (params.encodings?.length) {
      params.encodings.forEach((e) => Object.assign(e, { priority: "high", networkPriority: "high", maxBitrate: bitrateNow() }));
      void p.sender.setParameters(params).catch(() => {});
    }
  }
  // canal de video listo de entrada (lo crea el que llama): compartir pantalla después es instantáneo
  if (meId() < uid) {
    p.video = pc.addTransceiver("video", { direction: "sendrecv" });
    void plugScreen(p);
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) send({ from: meId(), to: uid, type: "ice", candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    // sin colchón extra: reproducir apenas llega (tiempo real)
    try {
      Object.assign(e.receiver, { jitterBufferTarget: 0, playoutDelayHint: 0 });
    } catch {}
    if (e.track.kind === "video") {
      const vs = new MediaStream([e.track]);
      setState((st) => ({ screens: { ...st.screens, [uid]: vs } }));
      return;
    }
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
  if (getState().screens[uid])
    setState((st) => {
      const screens = { ...st.screens };
      delete screens[uid];
      return { screens };
    });
  setPeerState(uid, null);
}

async function call(uid: string, restart = false) {
  const p = peerFor(uid);
  const offer = await p.pc.createOffer(restart ? { iceRestart: true } : undefined);
  const sdp = tuneOpus(offer.sdp ?? "", bitrateNow());
  await p.pc.setLocalDescription({ type: "offer", sdp });
  send({ from: meId(), to: uid, type: "offer", sdp });
}

async function onSignal(m: Sig) {
  if (m.to !== meId() || !local) return;
  try {
    if (m.type === "offer") {
      const p = peerFor(m.from);
      await p.pc.setRemoteDescription({ type: "offer", sdp: tuneOpus(m.sdp, bitrateNow()) });
      for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      // el canal de video que trajo la oferta: lo dejo para mandar y recibir
      const vt = p.pc.getTransceivers().find((t) => t.receiver.track?.kind === "video");
      if (vt) {
        vt.direction = "sendrecv";
        p.video = vt;
        void plugScreen(p);
      }
      const answer = await p.pc.createAnswer();
      const sdp = tuneOpus(answer.sdp ?? "", bitrateNow());
      await p.pc.setLocalDescription({ type: "answer", sdp });
      send({ from: meId(), to: m.from, type: "answer", sdp });
    } else if (m.type === "answer") {
      const p = peers.get(m.from);
      if (!p || p.pc.signalingState !== "have-local-offer") return;
      await p.pc.setRemoteDescription({ type: "answer", sdp: tuneOpus(m.sdp, bitrateNow()) });
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
  if (!channelAllows(s, channelId, "connect")) return toast("No tenés permiso para conectarte a este canal de voz.", "error");
  await leaveVoice(true);
  const seq = ++joinSeq;
  setState({ voice: { channelId, serverId: ch.server_id, status: "connecting" } });
  try {
    raw = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(getState().noiseMode), video: false });
  } catch (e) {
    if (seq !== joinSeq) return;
    setState({ voice: null });
    const name = (e as Error)?.name;
    toast(name === "NotAllowedError" ? "Fogón necesita permiso para usar tu micrófono. Habilitalo en el candado de la barra de direcciones." : name === "NotFoundError" ? "No encontramos ningún micrófono." : "No pudimos abrir el micrófono.", "error");
    return;
  }
  if (seq !== joinSeq) {
    raw.getTracks().forEach((t) => t.stop());
    raw = null;
    return;
  }
  const proc = await processMic(raw, getState().noiseMode);
  if (seq !== joinSeq) return proc.off();
  local = proc.stream;
  chainOff = proc.off;
  if (proc.mode !== getState().noiseMode) setState({ noiseMode: proc.mode });
  applyLocalMute();
  clearInterval(pingTimer);
  pingTimer = setInterval(() => void measurePing(), 2000);
  stopLocalMeter = meter(local, meId());
  chan = supabase.channel(`fogon-voice:${channelId}`, { config: { private: true, broadcast: { self: false }, presence: { key: meId() } } });
  chan
    .on("broadcast", { event: "sig" }, ({ payload }) => void onSignal(payload as Sig))
    .on("broadcast", { event: "bot_say" }, ({ payload }) => botSay(payload as { bot_id: string; text: string }))
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
  if (getState().localScreen) {
    stopScreenTracks();
    setState({ localScreen: null });
  }
  stopLocalMeter?.();
  stopLocalMeter = undefined;
  clearInterval(pingTimer);
  chainOff?.();
  chainOff = undefined;
  raw?.getTracks().forEach((t) => t.stop());
  raw = null;
  local = null;
  if (chan) {
    const c = chan;
    chan = null;
    await c.untrack().catch(() => {});
    void supabase.removeChannel(c);
  }
  if (was) {
    setState({ voice: null, speaking: {}, voicePeers: {}, voicePing: null, screens: {} });
    retrackPresence();
    if (!silent) ping(false);
  }
}

/* ---------- compartir pantalla (en vivo, directo entre navegadores) ---------- */

let screenTrack: MediaStreamTrack | null = null;

/** Engancha mi pantalla (o nada) al canal de video de una conexión, con prioridad a la fluidez. */
async function plugScreen(p: Peer) {
  const sender = p.video?.sender;
  if (!sender) return;
  try {
    await sender.replaceTrack(screenTrack);
    if (!screenTrack) return;
    const params = sender.getParameters();
    if (params.encodings?.length) {
      params.encodings.forEach((e) => Object.assign(e, { maxBitrate: 2_500_000, maxFramerate: 30, priority: "high", networkPriority: "high" }));
    }
    Object.assign(params, { degradationPreference: "balanced" });
    await sender.setParameters(params).catch(() => {});
  } catch (e) {
    console.warn("[fogon pantalla]", e);
  }
}

export function screenSupported() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

export async function startScreenShare() {
  const s = getState();
  if (!s.voice) return toast("Entrá a un canal de voz para compartir pantalla.", "error");
  if (!screenSupported()) return toast("Este navegador no permite compartir pantalla (probá desde una compu con Chrome, Edge o Firefox).", "error");
  if (!channelAllows(s, s.voice.channelId, "video")) return toast("No tenés permiso de Video en este canal.", "error");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } },
      audio: false,
    });
  } catch (e) {
    if ((e as Error)?.name !== "NotAllowedError") toast("No se pudo compartir la pantalla.", "error");
    return;
  }
  if (!getState().voice) return stream.getTracks().forEach((t) => t.stop());
  stopScreenTracks();
  screenTrack = stream.getVideoTracks()[0] ?? null;
  if (!screenTrack) return;
  try {
    screenTrack.contentHint = "detail"; // que el texto se lea bien
  } catch {}
  screenTrack.onended = () => void stopScreenShare(); // "Dejar de compartir" del navegador
  for (const p of peers.values()) await plugScreen(p);
  setState({ localScreen: stream });
  retrackPresence();
}

function stopScreenTracks() {
  getState().localScreen?.getTracks().forEach((t) => t.stop());
  screenTrack = null;
}

export async function stopScreenShare() {
  if (!getState().localScreen && !screenTrack) return;
  stopScreenTracks();
  for (const p of peers.values()) await plugScreen(p);
  setState({ localScreen: null });
  retrackPresence();
}

/** Mover a alguien (o a un bot) a otro canal de voz. Necesita administrar canales. */
export async function moveMember(userId: string, channelId: string) {
  const s = getState();
  const name = s.profiles[userId]?.display_name ?? "la persona";
  const dest = s.channels[channelId]?.name;
  const { error } = await supabase.rpc("fogon_voice_move", { p_user: userId, p_channel: channelId });
  if (error) return toast(error.message, "error");
  toast(dest ? `Movimos a ${name} a «${dest}»` : `Movimos a ${name}`);
}

/* ---------- me mueven a otro canal de voz ---------- */

let movesChan: RealtimeChannel | null = null;
let movesFor = "";

function watchMoves() {
  const id = meId();
  if (!id) {
    if (movesChan) {
      const old = movesChan;
      movesChan = null;
      movesFor = "";
      void supabase.removeChannel(old);
    }
    return;
  }
  if (id === movesFor) return;
  movesFor = id;
  if (movesChan) void supabase.removeChannel(movesChan);
  movesChan = supabase
    .channel(`fogon-moves:${id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_voice_moves" }, (p) => {
      const row = p.new as { user_id?: string; channel_id?: string | null };
      if (!row?.user_id || row.user_id !== meId() || !row.channel_id) return;
      void supabase.from("fogon_voice_moves").delete().eq("user_id", row.user_id);
      const s = getState();
      if (!s.voice || s.voice.channelId === row.channel_id) return;
      const name = s.channels[row.channel_id]?.name;
      void joinVoice(row.channel_id).then(() => toast(name ? `Te movieron a «${name}»` : "Te movieron de canal"));
    })
    .subscribe();
}

/** Sonidito de entrar / salir de la llamada. */
function ping(join: boolean) {
  if (!getState().sounds) return;
  try {
    audioCtx();
    const t = actx!.currentTime;
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
    const f = voiceForced(s);
    const others = s.voice ? [...peers.keys()].map((u) => (voiceForced(s, u).muted ? u : "")).join(",") : "";
    const k = `${s.micMuted}|${s.sounds}|${f.muted}|${f.deafened}|${others}`;
    if (k !== last) {
      if (s.voice && last && f.muted && !last.split("|")[2].includes("true")) {
        toast(f.noSpeak ? "No tenés permiso para hablar en este canal: entraste silenciado." : f.deafened ? "Un moderador te ensordeció en este servidor." : "Un moderador te silenció en este servidor.");
      }
      last = k;
      applyLocalMute();
    }
    // me sacaron del servidor o borraron el canal: corto
    if (s.voice && !s.channels[s.voice.channelId]) void leaveVoice();
    if (!s.session && s.voice) void leaveVoice(true);
    watchMoves();
  });
  watchMoves();
  window.addEventListener("pagehide", () => void leaveVoice(true));
}

/* ---------- prueba de micrófono (ajustes) ---------- */

export type MicTest = { level: () => number; stop: () => void; mode: NoiseMode };

/** Abre el micrófono con la supresión elegida y te deja escucharte (como "Probemos" de Discord). */
export async function startMicTest(mode: NoiseMode, hear: boolean): Promise<MicTest> {
  const src = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(mode), video: false });
  const proc = await processMic(src, mode);
  const ctx = audioCtx();
  const node = ctx.createMediaStreamSource(proc.stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  node.connect(an);
  if (hear) an.connect(ctx.destination);
  const buf = new Uint8Array(an.fftSize);
  return {
    mode: proc.mode,
    level: () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) * (v - 128);
      return Math.min(1, Math.sqrt(sum / buf.length) / 25);
    },
    stop: () => {
      try {
        node.disconnect();
        an.disconnect();
      } catch {}
      proc.off();
      src.getTracks().forEach((t) => t.stop());
    },
  };
}
