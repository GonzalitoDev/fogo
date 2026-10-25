/**
 * "Pantalla" de los bots: un video en vivo de verdad (MediaStream desde un canvas) que se dibuja
 * en el navegador de cada espectador con el estado compartido del canal (música, miembros, hora).
 * Los bots no tienen una pantalla física; esto es su transmisión: visualizador de música, partida
 * de ejemplo o panel de la comunidad, siempre en movimiento.
 */

import { getState } from "./store";
import type { Profile } from "./types";

const W = 960;
const H = 540;
const cache = new Map<string, { stream: MediaStream; stop: () => void }>();

type Theme = "music" | "game" | "panel";

function themeOf(username: string): Theme {
  if (["temazo.dj", "radio.fogon", "ro.musica"].includes(username)) return "music";
  if (["tincho_gamer", "santi_futbol", "patooo"].includes(username)) return "game";
  return "panel";
}

const rgba = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(122,99,214,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

function ellapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function drawCommon(ctx: CanvasRenderingContext2D, bot: Profile, started: number, t: number, color: string) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0a0b0f");
  g.addColorStop(0.6, "#10121a");
  g.addColorStop(1, rgba(color, 0.45));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // luces que se mueven despacio
  for (let i = 0; i < 3; i++) {
    const x = W * (0.2 + 0.3 * i) + Math.sin(t * 0.25 + i * 2) * 120;
    const y = H * 0.35 + Math.cos(t * 0.2 + i) * 90;
    const rad = 210 - i * 45;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, rgba(i === 1 ? "#7a63d6" : color, 0.22));
    rg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // EN VIVO + tiempo
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, 28, 24, 118, 30, 15);
  ctx.fill();
  ctx.fillStyle = "#f23f43";
  ctx.beginPath();
  ctx.arc(45, 39, 5 + Math.sin(t * 4) * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 13px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText("EN VIVO", 58, 44);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "600 13px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(clock(Date.now() - started), 152, 44);

  // avatar y nombre
  ctx.fillStyle = rgba(bot.color || "#7a63d6", 1);
  ctx.beginPath();
  ctx.arc(64, 96, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 18px 'Noto Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((bot.display_name || "B").slice(0, 2).toUpperCase(), 64, 103);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "700 24px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, bot.display_name, 520), 102, 94);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "500 14px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, bot.custom_status || `@${bot.username}`, 520), 102, 115);

  // pie
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = "600 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText("fogon · transmisión de un bot", 28, H - 22);
}

function drawMusic(ctx: CanvasRenderingContext2D, bot: Profile, channelId: string, t: number) {
  const ms = getState().music[channelId];
  const cur = ms?.current;
  const cardX = 56;
  const cardY = 158;
  const cardS = 210;

  const cover = ctx.createLinearGradient(cardX, cardY, cardX + cardS, cardY + cardS);
  cover.addColorStop(0, rgba(bot.color || "#7a63d6", 1));
  cover.addColorStop(1, "#1a1c25");
  ctx.fillStyle = cover;
  roundRect(ctx, cardX, cardY, cardS, cardS, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.arc(cardX + cardS / 2, cardY + cardS / 2, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 46px 'Noto Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((cur?.title || "F").slice(0, 1).toUpperCase(), cardX + cardS / 2, cardY + cardS / 2 + 16);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "800 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText("AHORA SUENA", 300, 176);
  ctx.fillStyle = "#fff";
  ctx.font = "700 30px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, cur?.title || "Radio Fogón", 600), 300, 214);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 17px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, cur?.artist || "Música sin parar, las 24 horas", 600), 300, 242);

  const dur = Number(cur?.duration) || 0;
  const start = ms?.started_at ? new Date(ms.started_at).getTime() : 0;
  const end = ms?.paused_at ? new Date(ms.paused_at).getTime() : Date.now();
  const pos = start ? Math.min(dur, Math.max(0, (end - start) / 1000)) : 0;
  const pct = dur ? pos / dur : 0;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  roundRect(ctx, 300, 266, 600, 6, 3);
  ctx.fill();
  ctx.fillStyle = rgba(bot.color || "#7a63d6", 1);
  roundRect(ctx, 300, 266, Math.max(4, 600 * pct), 6, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "600 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(`${ellapsed(pos * 1000)} / ${dur ? ellapsed(dur * 1000) : "--:--"}`, 300, 292);

  // visualizador
  const bars = 38;
  const bw = 10;
  const gap = 6;
  const base = 408;
  for (let i = 0; i < bars; i++) {
    const wave = Math.abs(Math.sin(t * 2.1 + i * 0.55) * Math.cos(t * 1.3 + i * 0.21));
    const h = 10 + wave * (cur ? 96 : 26) + (i % 5 === 0 ? 12 : 0);
    ctx.fillStyle = rgba(bot.color || "#7a63d6", 0.35 + (i / bars) * 0.55);
    roundRect(ctx, 56 + i * (bw + gap), base - h, bw, h, 4);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "600 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(cur ? "Pedí temas con !play" : "Esperando el próximo tema…", 56, 452);
}

function drawGame(ctx: CanvasRenderingContext2D, bot: Profile, t: number) {
  const x = 56;
  const y = 152;
  const w = 848;
  const h = 300;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([8, 10]);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 10);
  ctx.lineTo(x + w / 2, y + h - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  const playY = y + 20;
  const playH = h - 40;
  const ballX = x + 30 + Math.abs(((t * 260) % (w - 60) * 2) - (w - 60));
  const ballY = playY + playH / 2 + Math.sin(t * 2.6) * (playH / 2 - 12);
  const leftY = playY + playH / 2 + Math.sin(t * 2.1) * (playH / 2 - 60);
  const rightY = playY + playH / 2 + Math.sin(t * 2.6) * (playH / 2 - 60);

  ctx.fillStyle = "#fff";
  roundRect(ctx, x + 18, leftY - 46, 12, 92, 6);
  ctx.fill();
  roundRect(ctx, x + w - 30, rightY - 46, 12, 92, 6);
  ctx.fill();
  ctx.fillStyle = rgba(bot.color || "#7a63d6", 1);
  ctx.beginPath();
  ctx.arc(ballX, ballY, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 18px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(String(3 + Math.floor(t / 9) % 5), x + w / 2 - 90, y + 38);
  ctx.fillText(String(2 + Math.floor(t / 12) % 5), x + w / 2 + 70, y + 38);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "700 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(`STREAM DE ${bot.display_name.toUpperCase()}`, 56, 138);
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = "600 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(bot.custom_status || "partida en vivo", 56, 490);
}

function drawPanel(ctx: CanvasRenderingContext2D, bot: Profile, channelId: string, t: number) {
  const state = getState();
  const server = Object.values(state.servers).find((s) => s.name.toLowerCase().includes("fogón"));
  const members = server ? state.members[server.id]?.length ?? 0 : 0;
  const ms = state.music[channelId] ?? Object.values(state.music).find((m) => m.current);
  const lines = [
    "La comunidad oficial de Fogón",
    members ? `${members} fogoneros en el servidor` : "Un fogón que no se apaga",
    ms?.current ? `Escuchando: ${ms.current.title}` : "Música 24/7 en 📻 Radio 24/7",
    "Pedí temas con !play",
    "Bots que charlan, juegan y te contestan",
  ];
  const idx = Math.floor(t / 4.2) % lines.length;
  const x = 56;
  const y = 158;
  const w = 848;
  const h = 280;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "800 12px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText("PANEL DE LA COMUNIDAD", x + 32, y + 40);
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, lines[idx], w - 64), x + 32, y + 118);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "600 15px 'Noto Sans', system-ui, sans-serif";
  ctx.fillText(bot.custom_status || `@${bot.username}`, x + 32, y + 154);

  // puntitos de progreso
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === idx ? rgba(bot.color || "#7a63d6", 1) : "rgba(255,255,255,0.15)";
    roundRect(ctx, x + 32 + i * 22, y + h - 52, i === idx ? 26 : 10, 6, 3);
    ctx.fill();
  }
  // onda decorativa
  ctx.strokeStyle = rgba(bot.color || "#7a63d6", 0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const px = x + 32 + (i / 60) * (w - 64);
    const py = y + h - 90 + Math.sin(t * 2 + i * 0.35) * 12;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function render(ctx: CanvasRenderingContext2D, bot: Profile, channelId: string, started: number, t: number) {
  const theme = themeOf(bot.username);
  drawCommon(ctx, bot, started, t, bot.color || "#7a63d6");
  if (theme === "music") drawMusic(ctx, bot, channelId, t);
  else if (theme === "game") drawGame(ctx, bot, t);
  else drawPanel(ctx, bot, channelId, t);
}

/** Devuelve el video del bot (lo crea la primera vez). */
export function getBotStream(bot: Profile, channelId: string): MediaStream {
  const hit = cache.get(bot.id);
  if (hit) return hit.stream;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const started = Date.now();
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  if (track) track.contentHint = "detail";
  let raf = 0;
  const frame = () => {
    render(ctx, bot, channelId, started, (performance.now() - started) / 1000);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  render(ctx, bot, channelId, started, 0);
  const stop = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((tr) => tr.stop());
    cache.delete(bot.id);
  };
  cache.set(bot.id, { stream, stop });
  return stream;
}

export function stopBotStream(botId: string) {
  cache.get(botId)?.stop();
}

/** Apaga las transmisiones de bots que ya no están al aire. */
export function pruneBotStreams(keep: Set<string>) {
  for (const id of [...cache.keys()]) if (!keep.has(id)) stopBotStream(id);
}

export function stopAllBotStreams() {
  for (const { stop } of [...cache.values()]) stop();
  cache.clear();
}
