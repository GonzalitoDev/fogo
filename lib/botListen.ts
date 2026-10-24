"use client";

/*
 * "Los bots me escuchan": cuando estás en un canal de voz con bots, el reconocimiento de voz del
 * navegador pasa lo que decís a texto; la base elige qué bot contesta y le manda la respuesta a toda
 * la llamada, y cada uno la escucha con la voz sintetizada del navegador (con subtítulo en el bot).
 * Es opcional y apagado por defecto: en Chrome el audio se procesa en los servidores de Google.
 */
import { supabase } from "./supabase";
import { getState, setState, subscribe, toast } from "./store";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const Ctor = (): (new () => Rec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const listenSupported = () => !!Ctor() && typeof speechSynthesis !== "undefined";

let rec: Rec | null = null;
let running = false;
let talking = false; // mientras habla un bot no escucho (si no, se escucha a sí mismo)
let captionSeq = 0;
const said = new Map<string, number>();

function shouldListen() {
  const s = getState();
  if (!s.botsListen || !s.voice || s.voice.status !== "connected" || s.micMuted || !s.sounds) return false;
  return Object.values(s.botVoice).some((v) => v.ch === s.voice!.channelId);
}

function start() {
  const C = Ctor();
  if (!C || running || talking) return;
  try {
    rec = new C();
    rec.lang = "es-AR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const text = r[0]?.transcript?.trim();
        if (text) void heard(text);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast("El navegador no dejó usar el reconocimiento de voz.", "error");
        setState({ botsListen: false });
      }
    };
    rec.onend = () => {
      running = false;
      rec = null;
      // Chrome corta solo después de un rato de silencio: si sigue haciendo falta, vuelvo a arrancar
      setTimeout(() => shouldListen() && start(), 400);
    };
    rec.start();
    running = true;
  } catch {
    running = false;
  }
}

function stop() {
  if (!rec) return;
  const r = rec;
  rec = null;
  running = false;
  r.onend = null;
  try {
    r.abort();
  } catch {}
}

async function heard(text: string) {
  const ch = getState().voice?.channelId;
  if (!ch) return;
  const { data } = await supabase.rpc("fogon_bot_voice_say", { p_channel: ch, p_text: text });
  const d = data as { bot_id: string; text: string } | null;
  // por si el broadcast no llega, lo digo igual (sin repetir)
  if (d?.bot_id) setTimeout(() => botSay(d), 1200);
}

function voiceFor(botId: string) {
  let h = 0;
  for (const c of botId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("es"));
  const female = new Set(["flor.dibuja", "valeee", "camii", "ro.musica", "mica.cm", "juli.memes"]);
  const p = getState().profiles[botId];
  return { voice: voices.length ? voices[h % voices.length] : undefined, pitch: (female.has(p?.username ?? "") ? 1.2 : 0.85) + ((h % 20) - 10) / 100, rate: 1 + ((h >> 5) % 15) / 100 };
}

/** Un bot dice algo en la llamada (llega por el canal de voz, o de mi propia respuesta). */
export function botSay(p: { bot_id: string; text: string }) {
  const key = p.bot_id + "|" + p.text;
  const now = Date.now();
  if ((said.get(key) ?? 0) > now - 6000) return;
  said.set(key, now);
  const s = getState();
  if (!s.voice) return;
  const id = ++captionSeq;
  setState({ voiceCaption: { botId: p.bot_id, text: p.text, id } });
  const clear = () => {
    setTimeout(() => getState().voiceCaption?.id === id && setState({ voiceCaption: null }), 1500);
    setState((x) => {
      const speaking = { ...x.speaking };
      delete speaking[p.bot_id];
      return { speaking };
    });
    talking = false;
    if (shouldListen()) start();
  };
  if (!s.sounds || typeof speechSynthesis === "undefined") return clear();
  const u = new SpeechSynthesisUtterance(p.text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
  const v = voiceFor(p.bot_id);
  u.lang = "es-AR";
  if (v.voice) u.voice = v.voice;
  u.pitch = v.pitch;
  u.rate = v.rate;
  u.onstart = () => setState((x) => ({ speaking: { ...x.speaking, [p.bot_id]: true } }));
  u.onend = clear;
  u.onerror = clear;
  talking = true;
  stop();
  speechSynthesis.speak(u);
}

if (typeof window !== "undefined") {
  let last = false;
  subscribe(() => {
    const want = shouldListen();
    if (want === last) return;
    last = want;
    if (want) start();
    else stop();
  });
}
