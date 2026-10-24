/** Opus afinado para voz en tiempo real: paquetes de 10 ms, corrección de errores, sin DTX. */
export function tuneOpus(sdp: string, bitrate = 64000): string {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  const pt = m[1];
  const want: Record<string, string> = { minptime: "10", useinbandfec: "1", usedtx: "0", stereo: "0", "sprop-stereo": "0", maxaveragebitrate: String(bitrate) };
  const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const f = sdp.match(re);
  if (f) {
    const params = new Map(f[1].split(";").map((kv) => kv.trim().split("=") as [string, string]).filter(([k]) => k));
    for (const [k, v] of Object.entries(want)) params.set(k, v);
    sdp = sdp.replace(re, `a=fmtp:${pt} ${[...params].map(([k, v]) => `${k}=${v}`).join(";")}`);
  } else {
    sdp = sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(";")}`);
  }
  // el a=ptime va después del fmtp de opus (nunca antes de la línea c=)
  if (!/a=ptime:/.test(sdp)) sdp = sdp.replace(new RegExp(`(a=fmtp:${pt} [^\\r\\n]*)`), "$1\r\na=ptime:10");
  return tuneVideo(sdp);
}

/** Pantalla compartida: que arranque con buen ancho de banda en vez de subir de a poco (Chrome/Edge). */
export function tuneVideo(sdp: string): string {
  const want = "x-google-start-bitrate=1500;x-google-min-bitrate=500;x-google-max-bitrate=2500";
  const pts = [...sdp.matchAll(/a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\/90000/gi)].map((m) => m[1]);
  for (const pt of pts) {
    const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
    const f = sdp.match(re);
    if (f) {
      if (!f[1].includes("x-google-start-bitrate")) sdp = sdp.replace(re, `a=fmtp:${pt} ${f[1]};${want}`);
    } else {
      sdp = sdp.replace(new RegExp(`(a=rtpmap:${pt} [^\\r\\n]*)`), `$1\r\na=fmtp:${pt} ${want}`);
    }
  }
  return sdp;
}
