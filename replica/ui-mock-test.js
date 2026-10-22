// Recorrido de la UI de Fogón con Supabase simulado (intercepta las llamadas HTTP).
const chromium = require("@sparticuz/chromium").default;
const puppeteer = require("puppeteer-core");
const out = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = "") => results.push(`${c ? "PASS" : "FAIL"} ${n} ${x}`);

const REF = "xfwolaurpeofysnymqle";
const ME = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";
const SV = "33333333-3333-4333-8333-333333333333";
const CAT = "44444444-4444-4444-8444-444444444444";
const GEN = "55555555-5555-4555-8555-555555555555";
const MEMES = "66666666-6666-4666-8666-666666666666";
const DM = "77777777-7777-4777-8777-777777777777";
const profiles = {
  [ME]: { id: ME, username: "gonzadev", display_name: "Gonza", color: "#e07a3f" },
  [BETO]: { id: BETO, username: "beto", display_name: "Beto", color: "#3f7fd1" },
};
const t0 = Date.now() - 3600_000;
const iso = (m) => new Date(t0 + m * 60_000).toISOString();
const msgs = [
  { id: "m1", channel_id: GEN, author_id: BETO, content: "buenas!! alguien para un **fulbito** el sábado?", attachments: [], mentions: [], reply_to_id: null, created_at: iso(0), edited_at: null },
  { id: "m2", channel_id: GEN, author_id: BETO, content: "somos 8 por ahora", attachments: [], mentions: [], reply_to_id: null, created_at: iso(1), edited_at: null },
  { id: "m3", channel_id: GEN, author_id: ME, content: "yo voy, llevo la pelota ⚽", attachments: [], mentions: [], reply_to_id: "m1", created_at: iso(20), edited_at: iso(21) },
  { id: "m4", channel_id: GEN, author_id: BETO, content: "genial @gonzadev, mirá esto `npm run dev` y https://example.com/cancha", attachments: [], mentions: [ME], reply_to_id: null, created_at: iso(30), edited_at: null },
  { id: "m5", channel_id: GEN, author_id: BETO, content: "🔥🔥", attachments: [], mentions: [], reply_to_id: null, created_at: iso(31), edited_at: null },
];
const reactions = [{ message_id: "m3", user_id: BETO, emoji: "🙌" }, { message_id: "m3", user_id: ME, emoji: "🙌" }];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ME, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const session = {
  access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: ME, aud: "authenticated", role: "authenticated", email: "gonza@example.com", app_metadata: {}, user_metadata: {}, created_at: iso(0) },
};

function api(url, method, body, headers) {
  const u = new URL(url);
  const p = u.pathname;
  const one = (headers.accept || "").includes("vnd.pgrst.object");
  const json = (data) => ({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  if (p.startsWith("/auth/v1/user")) return json(session.user);
  if (p.startsWith("/rest/v1/rpc/fogon_unread")) return json([{ channel_id: MEMES, unread: true, mentions: 2 }, { channel_id: DM, unread: true, mentions: 1 }]);
  if (p.startsWith("/rest/v1/rpc/")) return { status: 204, body: "" };
  if (p === "/rest/v1/fogon_profiles") {
    const f = u.searchParams.get("id") || "";
    let list = Object.values(profiles);
    if (f.startsWith("eq.")) list = list.filter((x) => x.id === f.slice(3));
    if (f.startsWith("in.")) list = list.filter((x) => f.includes(x.id));
    return json(one ? list[0] ?? null : list);
  }
  if (p === "/rest/v1/fogon_servers") return json([{ id: SV, name: "Los pibes del barrio", owner_id: ME, invite_code: "3f9a1c0b2d", created_at: iso(0) }]);
  if (p === "/rest/v1/fogon_channels")
    return json([
      { id: CAT, server_id: SV, kind: "category", name: "Canales de texto", topic: "", position: 0, parent_id: null, last_message_at: null, created_at: iso(0) },
      { id: GEN, server_id: SV, kind: "text", name: "general", topic: "Para charlar de todo", position: 0, parent_id: CAT, last_message_at: iso(31), created_at: iso(0) },
      { id: MEMES, server_id: SV, kind: "text", name: "memes", topic: "", position: 1, parent_id: CAT, last_message_at: iso(40), created_at: iso(0) },
      { id: DM, server_id: null, kind: "dm", name: "", topic: "", position: 0, parent_id: null, last_message_at: iso(10), created_at: iso(0) },
    ]);
  if (p === "/rest/v1/fogon_members") return json([ME, BETO].map((id) => ({ server_id: SV, user_id: id, profile: profiles[id] })));
  if (p === "/rest/v1/fogon_dm_participants") return json([ME, BETO].map((id) => ({ channel_id: DM, user_id: id, profile: profiles[id] })));
  if (p === "/rest/v1/fogon_messages" && method === "GET") {
    const ch = u.searchParams.get("channel_id")?.replace("eq.", "");
    const list = msgs.filter((m) => m.channel_id === ch).slice().reverse().map((m) => ({ ...m, fogon_reactions: reactions.filter((r) => r.message_id === m.id) }));
    return json(list);
  }
  if (p === "/rest/v1/fogon_messages" && method === "POST") {
    const b = JSON.parse(body);
    const row = { ...b, mentions: /@beto/.test(b.content) ? [BETO] : [], created_at: new Date().toISOString(), edited_at: null };
    msgs.push(row);
    return json(one ? row : [row]);
  }
  if (p === "/rest/v1/fogon_messages" && method === "PATCH") {
    const id = u.searchParams.get("id").replace("eq.", "");
    const m = msgs.find((x) => x.id === id);
    Object.assign(m, JSON.parse(body), { edited_at: new Date().toISOString() });
    return json(one ? m : [m]);
  }
  if (p === "/rest/v1/fogon_reactions") return { status: 201, body: "" };
  return json([]);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|WebSocket/.test(m.text()) && errors.push(m.text()));
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(`${REF}.supabase.co`)) {
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      const r = api(url, req.method(), req.postData() || "", req.headers());
      return req.respond({ ...r, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*" } });
    }
    if (url.startsWith("http://localhost")) return req.continue();
    return req.abort();
  });
  await page.setViewport({ width: 1440, height: 900 });

  // 1) sin sesión: pantalla de login
  await page.goto("http://localhost:3002/", { waitUntil: "networkidle0" });
  await sleep(500);
  ok("sin sesión muestra el login", !!(await page.$("#email")));
  await page.screenshot({ path: `${out}/f1-login.png` });

  // 2) con sesión
  await page.evaluate((s, ref) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)), session, REF);
  await page.goto("about:blank");
  await page.goto(`http://localhost:3002/#/s/${SV}/${GEN}`, { waitUntil: "networkidle0" });
  await sleep(1200);
  const n = await page.$$eval(".msg", (e) => e.length);
  ok("canal muestra mensajes", n === 5, `(${n})`);
  ok("agrupa mensajes seguidos", (await page.$$eval(".msg.head", (e) => e.length)) === 4);
  ok("mensaje con mención propia resaltado", !!(await page.$(".msg.mentioned .mention.me")));
  ok("respuesta citada", !!(await page.$(".reply-ref")));
  ok("(editado)", !!(await page.$(".edited")));
  ok("reacción propia marcada", !!(await page.$(".react.mine")));
  ok("solo emojis se ven grandes", !!(await page.$(".body.jumbo")));
  ok("#memes en negrita con badge de 2", await page.$$eval(".chan.unread", (els) => els.some((e) => e.textContent.includes("memes") && e.textContent.includes("2"))));
  ok("lista de miembros", (await page.$$eval(".member", (e) => e.length)) === 2);
  await page.screenshot({ path: `${out}/f2-canal.png` });

  // 3) autocompletar @ y enviar
  await page.click("textarea[id^=composer]");
  await page.keyboard.type("che @be");
  await sleep(200);
  ok("autocompletar @ muestra a Beto", !!(await page.$(".suggest")));
  await page.screenshot({ path: `${out}/f3-mencion.png` });
  await page.keyboard.press("Enter");
  await page.keyboard.type("nos vemos");
  await page.keyboard.press("Enter");
  await sleep(600);
  const last = await page.$$eval(".msg .body", (e) => e[e.length - 1].textContent);
  ok("envía el mensaje con la mención completada", /che @Beto nos vemos/.test(last), `(${last})`);
  ok("el enviado se agrupa con el anterior propio o sale con cabecera", (await page.$$eval(".msg", (e) => e.length)) === 6);

  // 4) editar con flecha arriba
  await page.keyboard.press("ArrowUp");
  await sleep(200);
  ok("↑ con el compositor vacío edita el último propio", !!(await page.$(".edit-box textarea")));
  await page.keyboard.type(" (cambio)");
  await page.keyboard.press("Enter");
  await sleep(500);
  const edited = await page.$$eval(".msg .body", (e) => e[e.length - 1].textContent);
  ok("guarda la edición", /\(cambio\)/.test(edited) && /\(editado\)/.test(edited), `(${edited})`);

  // 5) responder
  const tools = await page.$$(".msg");
  await tools[0].hover();
  await page.click('.msg:first-of-type [aria-label="Responder"]').catch(async () => {
    const btn = await page.$$('[aria-label="Responder"]');
    await btn[0].click();
  });
  await sleep(200);
  ok("barra de respuesta en el compositor", !!(await page.$(".composer-bar")));
  await page.keyboard.press("Escape");

  // 6) Ctrl+K
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await sleep(200);
  ok("Ctrl+K abre el buscador de canales", !!(await page.$(".switcher")));
  await page.keyboard.type("bet");
  await page.keyboard.press("Enter");
  await sleep(800);
  ok("salta al DM con Beto", (await page.$eval(".chat-head h2", (e) => e.textContent)) === "Beto");
  await page.screenshot({ path: `${out}/f4-dm.png` });

  // 7) menú del servidor e invitación
  await page.goto("about:blank");
  await page.goto(`http://localhost:3002/#/s/${SV}/${GEN}`, { waitUntil: "networkidle0" });
  await sleep(800);
  await page.click(".side-head .name");
  await sleep(200);
  ok("menú del servidor (dueño) tiene crear canal", await page.$$eval(".menu button", (e) => e.some((b) => b.textContent.includes("Crear canal"))));
  await page.click(".menu button");
  await sleep(200);
  const link = await page.$eval("#invite-link", (e) => e.value);
  ok("link de invitación", /\?invite=3f9a1c0b2d$/.test(link), `(${link})`);
  await page.screenshot({ path: `${out}/f5-invitar.png` });
  await page.keyboard.press("Escape");

  // 8) celular
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(500);
  ok("celular sin scroll horizontal", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await page.screenshot({ path: `${out}/f6-celular.png` });
  await page.click('[aria-label="Abrir navegación"]');
  await sleep(300);
  await page.screenshot({ path: `${out}/f7-celular-menu.png` });
  ok("menú lateral en celular", await page.$eval(".nav-drawer", (e) => e.classList.contains("open")));

  ok("sin errores de JS", errors.length === 0, errors.join(" | ").slice(0, 600));
  console.log(results.join("\n"));
  await browser.close();
})().catch((e) => {
  console.log(results.join("\n"));
  console.error("CRASH", e);
  process.exit(1);
});
