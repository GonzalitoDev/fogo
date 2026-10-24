"use client";

/*
 * Decoraciones de avatar dibujadas en SVG (diseños propios de Fogón).
 * El SVG ocupa un 20% más que el avatar: el círculo de la foto va de 10 a 110 en el viewBox de 120.
 * Las seis primeras (fuego, corona, neón, corazones, estrellas, hojas) siguen siendo de CSS.
 */
import type { AvatarDeco } from "@/lib/decos";

const CSS_DECOS = new Set(["fuego", "corona", "neon", "corazones", "estrellas", "hojas"]);

export function AvatarDecoration({ id }: { id: AvatarDeco | string }) {
  if (CSS_DECOS.has(id)) return <span className={`deco deco-${id}`} aria-hidden="true" />;
  const art = ART[id as keyof typeof ART];
  if (!art) return null;
  return (
    <svg className={`deco-svg dz-${id}`} viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
      {art}
    </svg>
  );
}

const flower = (x: number, y: number, c: string, r = 6) => (
  <g transform={`translate(${x} ${y})`}>
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx="0" cy={-r * 0.75} rx={r * 0.55} ry={r * 0.8} fill={c} transform={`rotate(${a})`} />
    ))}
    <circle r={r * 0.42} fill="#ffd54a" />
  </g>
);

const ART = {
  fogata: (
    <>
      <circle cx="60" cy="60" r="52" fill="none" stroke="#ff8a3d" strokeWidth="4" strokeOpacity=".85" />
      <g className="dz-embers">
        <circle cx="38" cy="92" r="2" fill="#ffb347" />
        <circle cx="82" cy="96" r="1.6" fill="#ffd166" />
        <circle cx="60" cy="88" r="1.8" fill="#ff7a2a" />
      </g>
      <g transform="translate(60 106) scale(1.35)">
        <path d="M-16 8 16 1M-16 1l32 7" stroke="#8a4b2a" strokeWidth="5" strokeLinecap="round" />
        <path className="dz-flame" d="M0-20c4 7 10 9 10 17a10 10 0 0 1-20 0c0-4 2-6 4-8 0 3 2 5 4 5-1-5 0-10 2-14z" fill="#ff7a1a" />
        <path className="dz-flame" d="M0-9c2 4 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" fill="#ffd54a" />
      </g>
    </>
  ),
  mate: (
    <>
      <circle cx="60" cy="60" r="52" fill="none" stroke="#7fb069" strokeWidth="4" />
      <g transform="translate(98 94) scale(1.3)">
        <path className="dz-steam" d="M-2-20c-4-5 4-7 0-12M5-20c-4-5 4-7 0-12" stroke="#fff" strokeOpacity=".7" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M-11-12h22l-3 20a8 8 0 0 1-16 0z" fill="#a0612f" stroke="#5e3416" strokeWidth="1.5" />
        <path d="M-11-12h22" stroke="#c9a227" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="0" cy="-12" rx="9" ry="2.5" fill="#5f8f3a" />
        <path d="M4-12 14-30" stroke="#d9d9d9" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </>
  ),
  orejas_gato: (
    <>
      <g className="dz-wiggle-l">
        <path d="M18 34 22 4l26 18z" fill="#2b2b33" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M24 26 26 12l12 9z" fill="#ff9ec7" />
      </g>
      <g className="dz-wiggle-r">
        <path d="M102 34 98 4 72 22z" fill="#2b2b33" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M96 26 94 12l-12 9z" fill="#ff9ec7" />
      </g>
    </>
  ),
  aureola: (
    <g className="dz-float">
      <ellipse cx="60" cy="10" rx="30" ry="7" fill="none" stroke="#ffe27a" strokeWidth="5" />
      <ellipse cx="60" cy="10" rx="30" ry="7" fill="none" stroke="#fff6c8" strokeWidth="1.5" />
    </g>
  ),
  cuernitos: (
    <>
      <path d="M30 22c-8-6-10-16-6-22 2 8 8 12 16 14z" fill="#e0353b" stroke="#7a0f14" strokeWidth="1.5" />
      <path d="M90 22c8-6 10-16 6-22-2 8-8 12-16 14z" fill="#e0353b" stroke="#7a0f14" strokeWidth="1.5" />
      <path className="dz-tail" d="M104 98c8 2 10 10 4 14l6 4-8 1" stroke="#e0353b" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  auriculares: (
    <>
      <path d="M14 62a46 46 0 0 1 92 0" fill="none" stroke="#2c2f36" strokeWidth="8" strokeLinecap="round" />
      <path d="M14 62a46 46 0 0 1 92 0" fill="none" stroke="#5865f2" strokeWidth="3" strokeLinecap="round" />
      <rect x="2" y="54" width="16" height="30" rx="7" fill="#2c2f36" stroke="#5865f2" strokeWidth="2" />
      <rect x="102" y="54" width="16" height="30" rx="7" fill="#2c2f36" stroke="#5865f2" strokeWidth="2" />
      <circle className="dz-led" cx="10" cy="62" r="2.2" fill="#4cff9a" />
      <circle className="dz-led" cx="110" cy="62" r="2.2" fill="#4cff9a" />
    </>
  ),
  flores: (
    <>
      <path d="M14 46a48 48 0 0 1 92 0" fill="none" stroke="#4f9d69" strokeWidth="3" />
      {flower(18, 40, "#ff8fb8")}
      {flower(34, 20, "#ffffff")}
      {flower(60, 11, "#ff8fb8", 7)}
      {flower(86, 20, "#b9a2ff")}
      {flower(102, 40, "#ffffff")}
    </>
  ),
  rayos: (
    <>
      <circle className="dz-dash" cx="60" cy="60" r="53" fill="none" stroke="#ffe14d" strokeWidth="3" strokeDasharray="10 7" />
      <path className="dz-zap" d="M100 4 88 24h9l-9 18 20-24h-9z" fill="#ffe14d" stroke="#b38f00" strokeWidth="1" />
      <path className="dz-zap2" d="M14 86 6 102h7l-7 14 16-19h-7z" fill="#ffe14d" stroke="#b38f00" strokeWidth="1" />
    </>
  ),
  burbujas: (
    <g fill="rgba(160,220,255,.25)" stroke="#bfe8ff" strokeWidth="1.5">
      <circle className="dz-bub1" cx="104" cy="96" r="7" />
      <circle className="dz-bub2" cx="14" cy="88" r="5" />
      <circle className="dz-bub3" cx="98" cy="22" r="4" />
      <circle className="dz-bub1" cx="20" cy="26" r="6" />
      <circle cx="60" cy="60" r="53" fill="none" strokeOpacity=".7" />
    </g>
  ),
  nieve: (
    <>
      <circle cx="60" cy="60" r="53" fill="none" stroke="#dff4ff" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" />
      {[
        [16, 22, 7],
        [102, 18, 6],
        [108, 92, 8],
        [12, 98, 5],
      ].map(([x, y, s], i) => (
        <g key={i} className={i % 2 ? "dz-flake" : "dz-flake2"} stroke="#e9f8ff" strokeWidth="1.8" strokeLinecap="round">
          {[0, 60, 120].map((a) => (
            <path key={a} d={`M${x - s} ${y}h${2 * s}`} transform={`rotate(${a} ${x} ${y})`} />
          ))}
        </g>
      ))}
    </>
  ),
  arcoiris: (
    <g className="dz-spin-slow" style={{ transformOrigin: "60px 60px" }}>
      {["#ff5f5f", "#ffb347", "#ffe14d", "#5fd068", "#4fa8ff", "#a77bff"].map((c, i) => (
        <circle key={c} cx="60" cy="60" r="52" fill="none" stroke={c} strokeWidth="4" strokeDasharray="54.5 272.3" strokeDashoffset={-i * 54.5} />
      ))}
    </g>
  ),
  petalos: (
    <>
      <circle cx="60" cy="60" r="53" fill="none" stroke="#ffc1d9" strokeWidth="2" />
      {[
        [20, 10, "dz-fall1"],
        [96, 6, "dz-fall2"],
        [70, 0, "dz-fall3"],
        [8, 50, "dz-fall2"],
      ].map(([x, y, c], i) => (
        <path key={i} className={c as string} d={`M${x} ${y}c4-4 10-2 8 4-2 5-8 4-8-4z`} fill="#ffb0cf" stroke="#ff8fb8" strokeWidth=".8" />
      ))}
    </>
  ),
  pixel: (
    <g fill="#4cff9a">
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <rect key={i} x={60 + Math.cos(a) * 53 - 3} y={60 + Math.sin(a) * 53 - 3} width="6" height="6" fill={i % 3 === 0 ? "#ff5fd2" : i % 3 === 1 ? "#4cff9a" : "#4fa8ff"} />;
      })}
      <path d="M96 2h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#ffe14d" className="dz-blink" />
    </g>
  ),
  galaxia: (
    <>
      <circle className="dz-spin-slow" style={{ transformOrigin: "60px 60px" }} cx="60" cy="60" r="53" fill="none" stroke="url(#dzgal)" strokeWidth="5" />
      <defs>
        <linearGradient id="dzgal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a3df0" />
          <stop offset=".5" stopColor="#ff6fd8" />
          <stop offset="1" stopColor="#38d6ff" />
        </linearGradient>
      </defs>
      <g fill="#fff" className="dz-twinkle">
        <circle cx="12" cy="30" r="1.6" />
        <circle cx="106" cy="40" r="1.3" />
        <circle cx="100" cy="104" r="1.8" />
        <circle cx="22" cy="104" r="1.2" />
      </g>
      <circle cx="104" cy="16" r="6" fill="#f2c26b" />
      <ellipse cx="104" cy="16" rx="10" ry="2.6" fill="none" stroke="#ffe9b8" strokeWidth="1.3" transform="rotate(-20 104 16)" />
    </>
  ),
};
