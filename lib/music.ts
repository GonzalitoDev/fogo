"use client";

/*
 * Bot de música "Temazo": sin API key, con el catálogo abierto de Audius (como el clon de Spotify).
 * La base guarda qué suena y desde cuándo; cada uno que está en la llamada lo reproduce en su
 * navegador, sincronizado por la hora de arranque. El que llega tarde entra en el segundo justo.
 */
import { supabase } from "./supabase";
import { getState, setState, subscribe, toast, type MusicTrack } from "./store";

export const DJ_ID = "7c1d1f00-0000-4000-8000-00000000cf01";
const API = "https://api.audius.co/v1";
const APP = "fogon";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTrack(t: any): MusicTrack {
  return {
    id: String(t.id),
    title: String(t.title ?? "Sin título"),
    artist: String(t.user?.name || t.user?.handle || "Artista"),
    art: t.artwork?.["150x150"] || t.artwork?.["480x480"] || undefined,
    duration: Number(t.duration) || 0,
  };
}

async function get(path: string, params: Record<string, string | number> = {}): Promise<any[]> {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("app_name", APP);
  const r = await fetch(u.toString(), { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("No pudimos buscar música ahora. Probá de nuevo en un ratito.");
  const j = await r.json();
  return Array.isArray(j?.data) ? j.data : [];
}

const playable = (t: any) => t && t.is_streamable !== false && t.access?.stream !== false && !t.is_delete && t.is_available !== false && Number(t.duration) > 0;

export async function searchMusic(q: string, limit = 12): Promise<MusicTrack[]> {
  const rows = q.trim() ? await get("/tracks/search", { query: q.trim(), limit: limit + 6 }) : await get("/tracks/trending", { limit: limit + 6 });
  return rows.filter(playable).slice(0, limit).map(toTrack);
}

export const streamUrl = (id: string) => `${API}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`;

/* ---------- acciones ---------- */

const err = (e: unknown) => toast((e as { message?: string })?.message || "No se pudo", "error");

export async function addTrack(voiceChannel: string, t: MusicTrack, textChannel?: string | null) {
  const { error } = await supabase.rpc("fogon_music_add", { p_channel: voiceChannel, p_track: t, p_text_channel: textChannel ?? null });
  if (error) err(error);
}
export async function skip(voiceChannel: string, textChannel?: string | null) {
  const { error } = await supabase.rpc("fogon_music_next", { p_channel: voiceChannel, p_from: null, p_text_channel: textChannel ?? null });
  if (error) err(error);
}
export async function pause(voiceChannel: string, on: boolean, textChannel?: string | null) {
  const { error } = await supabase.rpc("fogon_music_pause", { p_channel: voiceChannel, p_pause: on, p_text_channel: textChannel ?? null });
  if (error) err(error);
}
export async function stopMusic(voiceChannel: string, textChannel?: string | null) {
  const { error } = await supabase.rpc("fogon_music_stop", { p_channel: voiceChannel, p_text_channel: textChannel ?? null });
  if (error) err(error);
}

export function setMusicVolume(v: number) {
  setState({ musicVolume: v });
  try {
    localStorage.setItem("fogon:musicVol", String(v));
  } catch {}
}

/** !play, !skip, !pausa… escritos en cualquier canal de texto (actúan sobre tu canal de voz). */
export async function musicCommand(textChannel: string, raw: string) {
  const m = raw.match(/^!(\w+)\s*(.*)$/s);
  if (!m) return;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim();
  const known = ["play", "p", "skip", "s", "next", "pausa", "pause", "sigue", "resume", "stop", "cola", "queue", "q", "ahora", "np", "musica", "música"];
  if (!known.includes(cmd)) return;
  const vc = getState().voice?.channelId;
  if (!vc) return toast("Entrá a un canal de voz primero y después pedí el tema 🎧", "error");
  try {
    if (cmd === "play" || cmd === "p") {
      const res = await searchMusic(arg, 1);
      if (!res[0]) return toast(`No encontré nada para «${arg}»`, "error");
      await addTrack(vc, res[0], textChannel);
    } else if (cmd === "skip" || cmd === "s" || cmd === "next") await skip(vc, textChannel);
    else if (cmd === "pausa" || cmd === "pause") await pause(vc, true, textChannel);
    else if (cmd === "sigue" || cmd === "resume") await pause(vc, false, textChannel);
    else if (cmd === "stop") await stopMusic(vc, textChannel);
    else if (cmd === "cola" || cmd === "queue" || cmd === "q") await supabase.rpc("fogon_music_info", { p_channel: vc, p_text_channel: textChannel, p_what: "cola" });
    else if (cmd === "ahora" || cmd === "np") await supabase.rpc("fogon_music_info", { p_channel: vc, p_text_channel: textChannel, p_what: "ahora" });
    else if (cmd === "musica" || cmd === "música")
      toast("🎵 Comandos: !play tema · !skip · !pausa · !sigue · !stop · !cola · !ahora");
  } catch (e) {
    err(e);
  }
}

/* ---------- reproductor: suena lo mismo para todos los de la llamada ---------- */

let audio: HTMLAudioElement | null = null;
let playingKey = "";

function sync() {
  const s = getState();
  const vc = s.voice?.status === "connected" ? s.voice.channelId : null;
  const ms = vc ? s.music[vc] : undefined;
  const cur = ms?.current;
  if (!vc || !cur || !ms?.started_at) {
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    playingKey = "";
    if (s.speaking[DJ_ID]) setSpeakingDj(false);
    return;
  }
  audio ??= Object.assign(new Audio(), { preload: "auto" });
  audio.volume = s.sounds ? s.musicVolume : 0;
  const key = `${vc}|${cur.id}|${ms.started_at}`;
  const offset = () => Math.max(0, ((ms.paused_at ? new Date(ms.paused_at).getTime() : Date.now()) - new Date(ms.started_at!).getTime()) / 1000);
  if (key !== playingKey) {
    playingKey = key;
    audio.src = streamUrl(cur.id);
    audio.onloadedmetadata = () => {
      try {
        audio!.currentTime = Math.min(offset(), Math.max(0, (audio!.duration || cur.duration) - 1));
      } catch {}
    };
    audio.onended = () => void supabase.rpc("fogon_music_next", { p_channel: vc, p_from: cur.id, p_text_channel: null });
    audio.onerror = () => toast("No se pudo reproducir ese tema, paso al siguiente", "error");
  }
  if (ms.paused_at) {
    audio.pause();
    setSpeakingDj(false);
  } else {
    // si se fue de sincronía (pausa/reanudación), lo acomodo
    if (audio.readyState > 0 && Math.abs(audio.currentTime - offset()) > 3) {
      try {
        audio.currentTime = offset();
      } catch {}
    }
    void audio.play().then(
      () => setSpeakingDj(true),
      () => {},
    );
  }
}

function setSpeakingDj(on: boolean) {
  setState((x) => {
    const speaking = { ...x.speaking };
    if (on) speaking[DJ_ID] = true;
    else delete speaking[DJ_ID];
    return { speaking };
  });
}

if (typeof window !== "undefined") {
  try {
    const v = Number(localStorage.getItem("fogon:musicVol"));
    if (v >= 0 && v <= 1 && localStorage.getItem("fogon:musicVol") !== null) setState({ musicVolume: v });
  } catch {}
  let last = "";
  subscribe(() => {
    const s = getState();
    const vc = s.voice?.status === "connected" ? s.voice.channelId : "";
    const ms = vc ? s.music[vc] : undefined;
    const k = `${vc}|${ms?.current?.id}|${ms?.started_at}|${ms?.paused_at}|${s.sounds}|${s.musicVolume}`;
    if (k === last) return;
    last = k;
    sync();
  });
}
