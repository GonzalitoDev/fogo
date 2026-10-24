"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { BUCKET, supabase } from "./supabase";
import { friendlyError, upsertMessage } from "./chat";
import type { Ban, ChanPerm, Override, Presence, Relation, SettingsView, Status } from "./types";
import type { Attachment, Channel, Message, Perm, Place, Profile, Reaction, Role, Server, Unread } from "./types";

/* ---------- store mínimo ---------- */

type ChannelMessages = { list: Message[]; loaded: boolean; hasMore: boolean; loading: boolean };

export type State = {
  ready: boolean;
  session: Session | null;
  me: Profile | null;
  needsProfile: boolean;
  servers: Record<string, Server>;
  channels: Record<string, Channel>;
  members: Record<string, string[]>; // serverId -> userIds
  roles: Record<string, Role>;
  memberRoles: Record<string, Record<string, string[]>>; // serverId -> userId -> roleIds
  dmPeers: Record<string, string>; // channelId -> userId del otro
  profiles: Record<string, Profile>;
  messages: Record<string, ChannelMessages>;
  reactions: Record<string, Reaction[]>; // messageId -> reacciones
  replyCache: Record<string, Message | null>; // mensajes citados que no están cargados
  unread: Record<string, Unread>;
  place: Place;
  online: boolean;
  toast: { id: number; text: string; tone: "info" | "error" } | null;
  badges: Record<string, string[]>; // userId -> insignias dadas a mano
  isAdmin: boolean;
  presence: Record<string, Presence>; // userId -> conectado ahora (Realtime Presence)
  joined: Record<string, Record<string, string>>; // serverId -> userId -> fecha en que entró
  fullProfile: string | null; // userId del perfil completo abierto
  editingProfile: boolean;
  relations: Record<string, Relation>; // otro userId -> amigo / solicitud
  blocked: Record<string, true>;
  lastRead: Record<string, string | null>; // channelId -> último leído al entrar (para la línea de NUEVOS)
  settings: SettingsView | null;
  sounds: boolean;
  jumpTo: string | null; // mensaje a mostrar (desde búsqueda o fijados)
  overrides: Record<string, Override[]>; // channelId -> permisos por rol
};

const initial: State = {
  ready: false,
  session: null,
  me: null,
  needsProfile: false,
  servers: {},
  channels: {},
  members: {},
  roles: {},
  memberRoles: {},
  dmPeers: {},
  profiles: {},
  messages: {},
  reactions: {},
  replyCache: {},
  unread: {},
  place: { kind: "dm", channelId: null },
  online: true,
  toast: null,
  badges: {},
  isAdmin: false,
  presence: {},
  joined: {},
  fullProfile: null,
  editingProfile: false,
  relations: {},
  blocked: {},
  lastRead: {},
  settings: null,
  sounds: true,
  jumpTo: null,
  overrides: {},
};

let state: State = initial;
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(initial));
}

let toastId = 0;
export function toast(text: string, tone: "info" | "error" = "info") {
  setState({ toast: { id: ++toastId, text, tone } });
}
export function fail(e: unknown) {
  toast(friendlyError(e), "error");
}

export const PCOLS = "id,username,display_name,color,created_at,bio,pronouns,banner_color,theme_top,theme_bottom,avatar_path,banner_path,status,custom_status,is_bot";
const meId = () => state.session?.user.id ?? "";

/* ---------- lugar actual (en el hash para que sobreviva a recargar) ---------- */

export function placeFromHash(): Place {
  const h = typeof location === "undefined" ? "" : location.hash.replace(/^#\/?/, "");
  const [kind, a, b] = h.split("/");
  if (kind === "s" && a) return { kind: "server", serverId: a, channelId: b || null };
  if (kind === "dm") return { kind: "dm", channelId: a || null };
  return { kind: "dm", channelId: null };
}

export function go(place: Place) {
  const hash = place.kind === "server" ? `#/s/${place.serverId}${place.channelId ? `/${place.channelId}` : ""}` : `#/dm${place.channelId ? `/${place.channelId}` : ""}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  // si el canal no viene, el primero de texto del servidor
  if (place.kind === "server" && !place.channelId) {
    const first = firstChannel(place.serverId);
    if (first) return go({ ...place, channelId: first });
  }
  setState({ place });
  if (place.channelId) {
    try {
      if (place.kind === "server") localStorage.setItem(`fogon:last:${place.serverId}`, place.channelId);
    } catch {}
    openChannel(place.channelId);
  }
}

function firstChannel(serverId: string): string | null {
  try {
    const last = localStorage.getItem(`fogon:last:${serverId}`);
    if (last && state.channels[last]?.server_id === serverId) return last;
  } catch {}
  const texts = Object.values(state.channels)
    .filter((c) => c.server_id === serverId && c.kind === "text")
    .sort((a, b) => {
      const pa = a.parent_id ? state.channels[a.parent_id]?.position ?? 0 : -1;
      const pb = b.parent_id ? state.channels[b.parent_id]?.position ?? 0 : -1;
      return pa - pb || a.position - b.position || a.created_at.localeCompare(b.created_at);
    });
  return texts[0]?.id ?? null;
}

/* ---------- sesión ---------- */

export async function boot() {
  // link de confirmación vencido o ya usado: Supabase vuelve con #error=...
  if (/error_code=|error_description=/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.slice(1));
    const code = p.get("error_code") ?? "";
    history.replaceState(null, "", location.pathname + location.search);
    setTimeout(
      () =>
        toast(
          code === "otp_expired" || /expired|invalid/i.test(p.get("error_description") ?? "")
            ? "Ese link ya no sirve, pero tu cuenta ya está confirmada. Entrá con tu email y contraseña."
            : "No se pudo abrir el link del mail. Entrá con tu email y contraseña.",
        ),
      300,
    );
  }
  const { data } = await supabase.auth.getSession();
  await onSession(data.session);
  supabase.auth.onAuthStateChange((_ev, session) => {
    if ((session?.user.id ?? null) !== (state.session?.user.id ?? null)) void onSession(session);
    else setState({ session });
  });
  window.addEventListener("hashchange", () => {
    if (state.me) go(placeFromHash());
  });
  window.addEventListener("online", () => setState({ online: true }));
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => {
    const ch = state.place.channelId;
    if (document.visibilityState === "visible" && ch && state.unread[ch]?.unread) markRead(ch);
  });
}

async function onSession(session: Session | null) {
  stopRealtime();
  setState({ ...initial, session, ready: false, online: typeof navigator === "undefined" ? true : navigator.onLine });
  if (!session) return setState({ ready: true });
  const { data: me, error } = await supabase.from("fogon_profiles").select(`${PCOLS}`).eq("id", session.user.id).maybeSingle();
  if (error) {
    fail(error);
    return setState({ ready: true });
  }
  if (!me) return setState({ ready: true, needsProfile: true });
  setState({ me, profiles: { [me.id]: me } });
  await loadAll();
  void loadBadges();
  void loadFriends();
  try {
    setState({ sounds: localStorage.getItem("fogon:sounds") !== "0" });
  } catch {}
  startRealtime();
  startPresence();
  setState({ ready: true });
  const p = placeFromHash();
  if (p.kind === "server" && !state.servers[p.serverId]) go({ kind: "dm", channelId: null });
  else go(p);
}

export async function createProfile(username: string, displayName: string, color: string) {
  const id = meId();
  const { error } = await supabase.from("fogon_profiles").insert({ id, username: username.toLowerCase(), display_name: displayName.trim(), color });
  if (error) throw error;
  await onSession(state.session);
}

export type ProfilePatch = Partial<Pick<Profile, "display_name" | "color" | "bio" | "pronouns" | "banner_color" | "theme_top" | "theme_bottom" | "avatar_path" | "banner_path" | "status" | "custom_status">>;

export async function updateProfile(patch: ProfilePatch) {
  const clean: ProfilePatch = { ...patch };
  if (clean.display_name !== undefined) clean.display_name = clean.display_name.trim();
  const { data, error } = await supabase.from("fogon_profiles").update(clean).eq("id", meId()).select(PCOLS).single();
  if (error) throw error;
  setState((s) => ({ me: data as Profile, profiles: { ...s.profiles, [data.id]: data as Profile } }));
  if (patch.status !== undefined) void trackPresence();
}

/* ---------- fotos de perfil y banners (bucket público) ---------- */

export const MEDIA_BUCKET = "fogon-profiles";
export const mediaUrl = (path?: string | null) => (path ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl : null);

/** Achica la imagen en el navegador (los GIF se suben tal cual para no perder la animación). */
async function shrink(file: File, maxW: number, maxH: number): Promise<Blob> {
  if (file.type === "image/gif") {
    if (file.size > 5 * 1024 * 1024) throw new Error("El GIF pesa más de 5 MB.");
    return file;
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo leer la imagen."))), "image/webp", 0.88));
}

/** Sube la foto o el banner y devuelve la ruta (no guarda el perfil). */
export async function uploadProfileMedia(kind: "avatar" | "banner", file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Tiene que ser una imagen.");
  const blob = kind === "avatar" ? await shrink(file, 512, 512) : await shrink(file, 1200, 480);
  const ext = blob.type === "image/gif" ? "gif" : "webp";
  const path = `${meId()}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return path;
}

export function removeProfileMedia(path?: string | null) {
  if (path) void supabase.storage.from(MEDIA_BUCKET).remove([path]);
}

/* ---------- presencia: quién está conectado ---------- */

let pres: ReturnType<typeof supabase.channel> | null = null;
let away = false;

function myPresence(): Presence | null {
  const st = state.me?.status ?? "online";
  if (st === "invisible") return null;
  if (st === "online" && away) return "idle";
  return st;
}

async function trackPresence() {
  if (!pres) return;
  const p = myPresence();
  if (p) await pres.track({ status: p });
  else await pres.untrack();
}

function startPresence() {
  stopPresence();
  const id = meId();
  if (!id) return;
  pres = supabase.channel("fogon-presence", { config: { presence: { key: id } } });
  pres
    .on("presence", { event: "sync" }, () => {
      const raw = pres!.presenceState() as Record<string, { status?: Presence }[]>;
      const map: Record<string, Presence> = {};
      const rank = { online: 3, dnd: 2, idle: 1, offline: 0 } as const;
      for (const [uid, metas] of Object.entries(raw)) {
        // varias pestañas: gana la más "activa"
        let best: Presence = "offline";
        for (const m of metas) if (m.status && rank[m.status] > rank[best]) best = m.status;
        if (best !== "offline") map[uid] = best;
      }
      setState({ presence: map });
    })
    .subscribe((st) => {
      if (st === "SUBSCRIBED") void trackPresence();
    });
}

function stopPresence() {
  if (pres) void supabase.removeChannel(pres);
  pres = null;
}

if (typeof document !== "undefined") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    if (document.visibilityState === "hidden") {
      // 5 minutos en otra pestaña = ausente, como en Discord
      timer = setTimeout(() => {
        away = true;
        void trackPresence();
      }, 5 * 60_000);
    } else if (away) {
      away = false;
      void trackPresence();
    }
  });
}

/** Estado que se muestra de alguien (yo me veo como elegí, aunque esté invisible). */
export function presenceOf(s: State, userId: string): Presence {
  const prof = s.profiles[userId];
  if (prof?.is_bot) return prof.status === "invisible" || !prof.status ? "offline" : prof.status;
  if (userId === s.me?.id) {
    const st = s.me.status ?? "online";
    return st === "invisible" ? "offline" : st === "online" && away ? "idle" : st;
  }
  return s.presence[userId] ?? "offline";
}

export async function setStatus(status: Status) {
  try {
    await updateProfile({ status });
  } catch (e) {
    fail(e);
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ---------- carga inicial ---------- */

type MemberRow = { server_id: string; user_id: string; joined_at?: string; profile: Profile | null };
type DmRow = { channel_id: string; user_id: string; profile: Profile | null };

export async function loadAll() {
  const [servers, channels, members, dms, unread, roles, memberRoles, overrides] = await Promise.all([
    supabase.from("fogon_servers").select("*"),
    supabase.from("fogon_channels").select("*"),
    supabase.from("fogon_members").select(`server_id,user_id,joined_at,profile:fogon_profiles(${PCOLS})`),
    supabase.from("fogon_dm_participants").select(`channel_id,user_id,profile:fogon_profiles(${PCOLS})`),
    supabase.rpc("fogon_unread"),
    supabase.from("fogon_roles").select("*"),
    supabase.from("fogon_member_roles").select("server_id,user_id,role_id"),
    supabase.from("fogon_channel_overrides").select("*"),
  ]);
  if (!overrides.error) setState({ overrides: groupOverrides(overrides.data as Override[]) });
  const err = servers.error || channels.error || members.error || dms.error || unread.error || roles.error || memberRoles.error;
  if (err) return fail(err);
  const profiles: Record<string, Profile> = { ...state.profiles };
  const mem: Record<string, string[]> = {};
  const joined: Record<string, Record<string, string>> = {};
  for (const r of members.data as unknown as MemberRow[]) {
    (mem[r.server_id] ??= []).push(r.user_id);
    if (r.joined_at) (joined[r.server_id] ??= {})[r.user_id] = r.joined_at;
    if (r.profile) profiles[r.profile.id] = r.profile;
  }
  const peers: Record<string, string> = {};
  for (const r of dms.data as unknown as DmRow[]) {
    if (r.profile) profiles[r.profile.id] = r.profile;
    if (r.user_id !== meId()) peers[r.channel_id] = r.user_id;
  }
  const un: Record<string, Unread> = {};
  for (const r of (unread.data ?? []) as { channel_id: string; unread: boolean; mentions: number }[]) un[r.channel_id] = { unread: r.unread, mentions: Number(r.mentions) };
  setState({
    servers: Object.fromEntries((servers.data as Server[]).map((x) => [x.id, x])),
    channels: Object.fromEntries((channels.data as Channel[]).map((x) => [x.id, x])),
    members: mem,
    joined,
    dmPeers: peers,
    profiles,
    unread: un,
    ...rolesState(roles.data as Role[], memberRoles.data as MemberRoleRow[]),
  });
}

type MemberRoleRow = { server_id: string; user_id: string; role_id: string };

function rolesState(roles: Role[], rows: MemberRoleRow[]) {
  const mr: Record<string, Record<string, string[]>> = {};
  for (const r of rows) ((mr[r.server_id] ??= {})[r.user_id] ??= []).push(r.role_id);
  return { roles: Object.fromEntries(roles.map((r) => [r.id, r])), memberRoles: mr };
}

export async function loadRoles() {
  const [roles, rows] = await Promise.all([
    supabase.from("fogon_roles").select("*"),
    supabase.from("fogon_member_roles").select("server_id,user_id,role_id"),
  ]);
  if (roles.error || rows.error) return fail(roles.error || rows.error);
  setState(rolesState(roles.data as Role[], rows.data as MemberRoleRow[]));
}

async function ensureProfiles(ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => id && !state.profiles[id]);
  if (!missing.length) return;
  const { data } = await supabase.from("fogon_profiles").select(`${PCOLS}`).in("id", missing);
  if (data?.length) setState((s) => ({ profiles: { ...s.profiles, ...Object.fromEntries(data.map((p) => [p.id, p])) } }));
}

/* ---------- mensajes ---------- */

const PAGE = 50;
type Row = Message & { fogon_reactions?: Reaction[] };

function ingest(rows: Row[]) {
  const reactions: Record<string, Reaction[]> = {};
  const msgs = rows.map(({ fogon_reactions, ...m }) => {
    reactions[m.id] = fogon_reactions ?? [];
    return { ...m, attachments: m.attachments ?? [], mentions: m.mentions ?? [] } as Message;
  });
  setState((s) => ({ reactions: { ...s.reactions, ...reactions } }));
  void ensureProfiles(msgs.map((m) => m.author_id));
  void loadReplies(msgs);
  return msgs;
}

async function loadReplies(msgs: Message[]) {
  const have = new Set(Object.values(state.messages).flatMap((c) => c.list.map((m) => m.id)));
  const ids = [...new Set(msgs.map((m) => m.reply_to_id).filter((id): id is string => !!id && !have.has(id) && !(id in state.replyCache)))];
  if (!ids.length) return;
  const { data } = await supabase.from("fogon_messages").select("*").in("id", ids);
  const found = Object.fromEntries((data ?? []).map((m) => [m.id, m as Message]));
  setState((s) => ({ replyCache: { ...s.replyCache, ...Object.fromEntries(ids.map((id) => [id, found[id] ?? null])) } }));
  void ensureProfiles((data ?? []).map((m) => m.author_id));
}

function setChannelMessages(id: string, patch: Partial<ChannelMessages>) {
  setState((s) => {
    const cur = s.messages[id] ?? { list: [], loaded: false, hasMore: true, loading: false };
    return { messages: { ...s.messages, [id]: { ...cur, ...patch } } };
  });
}

export async function openChannel(id: string) {
  // antes de marcar como leído, guardo hasta dónde había leído (línea roja de NUEVOS)
  if (state.unread[id]?.unread) {
    const { data } = await supabase.rpc("fogon_last_read", { p_channel: id });
    setState((s) => ({ lastRead: { ...s.lastRead, [id]: (data as string | null) ?? null } }));
  } else if (!(id in state.lastRead)) {
    setState((s) => ({ lastRead: { ...s.lastRead, [id]: null } }));
  }
  markRead(id);
  const cur = state.messages[id];
  if (cur?.loaded || cur?.loading) return;
  setChannelMessages(id, { loading: true });
  const { data, error } = await supabase
    .from("fogon_messages")
    .select("*, fogon_reactions(message_id,user_id,emoji)")
    .eq("channel_id", id)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) {
    setChannelMessages(id, { loading: false });
    return fail(error);
  }
  const msgs = ingest(data as Row[]).reverse();
  setState((s) => {
    // pueden haber llegado mensajes por Realtime mientras cargaba
    let list = msgs;
    for (const m of s.messages[id]?.list ?? []) list = upsertMessage(list, m);
    return { messages: { ...s.messages, [id]: { list, loaded: true, hasMore: msgs.length === PAGE, loading: false } } };
  });
}

export async function loadOlder(id: string) {
  const cur = state.messages[id];
  if (!cur || cur.loading || !cur.hasMore) return;
  const oldest = cur.list.find((m) => !m.status);
  if (!oldest) return;
  setChannelMessages(id, { loading: true });
  const { data, error } = await supabase
    .from("fogon_messages")
    .select("*, fogon_reactions(message_id,user_id,emoji)")
    .eq("channel_id", id)
    .lt("created_at", oldest.created_at)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) {
    setChannelMessages(id, { loading: false });
    return fail(error);
  }
  const older = ingest(data as Row[]).reverse();
  setState((s) => {
    const c = s.messages[id];
    return { messages: { ...s.messages, [id]: { ...c, list: [...older, ...c.list], hasMore: older.length === PAGE, loading: false } } };
  });
}

let readTimers: Record<string, ReturnType<typeof setTimeout>> = {};
export function markRead(id: string) {
  if (state.unread[id]?.unread || state.unread[id]?.mentions) {
    setState((s) => ({ unread: { ...s.unread, [id]: { unread: false, mentions: 0 } } }));
  }
  clearTimeout(readTimers[id]);
  readTimers[id] = setTimeout(() => void supabase.rpc("fogon_mark_read", { p_channel: id }), 600);
}

/* ---------- enviar / editar / borrar ---------- */

async function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return {};
  }
}

const pendingFiles: Record<string, File[]> = {};

export async function sendMessage(channelId: string, content: string, files: File[], replyTo: string | null, retryId?: string) {
  const id = retryId ?? crypto.randomUUID();
  const me = meId();
  if (!retryId) {
    pendingFiles[id] = files;
    const optimistic: Message = {
      id,
      channel_id: channelId,
      author_id: me,
      content,
      attachments: [],
      mentions: [],
      reply_to_id: replyTo,
      created_at: new Date().toISOString(),
      edited_at: null,
      status: "sending",
      localFiles: files.map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    };
    setChannelMessages(channelId, { list: upsertMessage(state.messages[channelId]?.list ?? [], optimistic) });
  } else {
    patchMessage(channelId, id, { status: "sending" });
  }
  try {
    const attachments: Attachment[] = [];
    for (const [i, f] of (pendingFiles[id] ?? []).entries()) {
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
      const path = `${channelId}/${me}/${id}-${i}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: true });
      if (up.error) throw up.error;
      attachments.push({ path, name: f.name.slice(0, 120), size: f.size, type: f.type, ...(await imageSize(f)) });
    }
    const { data, error } = await supabase
      .from("fogon_messages")
      .insert({ id, channel_id: channelId, author_id: me, content, attachments, reply_to_id: replyTo })
      .select("*")
      .single();
    if (error) throw error;
    delete pendingFiles[id];
    const list = upsertMessage(state.messages[channelId]?.list ?? [], { ...(data as Message), localFiles: undefined });
    setChannelMessages(channelId, { list });
    setState((s) => ({ reactions: { ...s.reactions, [id]: s.reactions[id] ?? [] } }));
  } catch (e) {
    // si ya se insertó (el eco llegó por Realtime), no es un fallo
    if (/duplicate key/.test(String((e as { message?: string })?.message))) return patchMessage(channelId, id, { status: undefined });
    patchMessage(channelId, id, { status: "failed" });
    fail(e);
  }
}

export function discardFailed(channelId: string, id: string) {
  delete pendingFiles[id];
  setChannelMessages(channelId, { list: (state.messages[channelId]?.list ?? []).filter((m) => m.id !== id) });
}

function patchMessage(channelId: string, id: string, patch: Partial<Message>) {
  const list = state.messages[channelId]?.list ?? [];
  setChannelMessages(channelId, { list: list.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export async function editMessage(m: Message, content: string) {
  if (content === m.content) return;
  const prev = m.content;
  patchMessage(m.channel_id, m.id, { content, edited_at: new Date().toISOString() });
  const { data, error } = await supabase.from("fogon_messages").update({ content }).eq("id", m.id).select("*").single();
  if (error) {
    patchMessage(m.channel_id, m.id, { content: prev, edited_at: m.edited_at });
    return fail(error);
  }
  patchMessage(m.channel_id, m.id, data as Message);
}

export async function deleteMessage(m: Message) {
  const list = state.messages[m.channel_id]?.list ?? [];
  setChannelMessages(m.channel_id, { list: list.filter((x) => x.id !== m.id) });
  const { error } = await supabase.from("fogon_messages").delete().eq("id", m.id);
  if (error) {
    setChannelMessages(m.channel_id, { list });
    return fail(error);
  }
  if (m.attachments.length) void supabase.storage.from(BUCKET).remove(m.attachments.map((a) => a.path));
}

export async function toggleReaction(messageId: string, emoji: string) {
  const me = meId();
  const cur = state.reactions[messageId] ?? [];
  const mine = cur.some((r) => r.user_id === me && r.emoji === emoji);
  const next = mine ? cur.filter((r) => !(r.user_id === me && r.emoji === emoji)) : [...cur, { message_id: messageId, user_id: me, emoji }];
  setState((s) => ({ reactions: { ...s.reactions, [messageId]: next } }));
  const { error } = mine
    ? await supabase.from("fogon_reactions").delete().match({ message_id: messageId, user_id: me, emoji })
    : await supabase.from("fogon_reactions").insert({ message_id: messageId, user_id: me, emoji });
  if (error && !/duplicate key/.test(error.message)) {
    setState((s) => ({ reactions: { ...s.reactions, [messageId]: cur } }));
    fail(error);
  }
}

/* ---------- imágenes (URLs firmadas, con caché) ---------- */

const urlCache = new Map<string, { url: string; exp: number }>();
const urlWaiters = new Map<string, Promise<void>>();

export function cachedUrl(path: string): string | null {
  const c = urlCache.get(path);
  return c && c.exp > Date.now() ? c.url : null;
}

let batch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchPromise: Promise<void> | null = null;
let batchResolve: (() => void) | null = null;

/** Junta pedidos de varias imágenes en un solo llamado */
export function signedUrl(path: string): Promise<void> {
  if (cachedUrl(path)) return Promise.resolve();
  const w = urlWaiters.get(path);
  if (w) return w;
  batch.push(path);
  if (!batchPromise) batchPromise = new Promise<void>((r) => (batchResolve = r));
  const p = batchPromise;
  urlWaiters.set(path, p);
  if (!batchTimer)
    batchTimer = setTimeout(async () => {
      const paths = batch;
      const resolve = batchResolve!;
      batch = [];
      batchTimer = null;
      batchPromise = null;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      for (const d of data ?? []) if (d.signedUrl && d.path) urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 55 * 60_000 });
      paths.forEach((x) => urlWaiters.delete(x));
      resolve();
    }, 30);
  return p;
}

/* ---------- servidores y canales ---------- */

export async function createServer(name: string) {
  const { data, error } = await supabase.rpc("fogon_create_server", { p_name: name });
  if (error) throw error;
  await loadAll();
  go({ kind: "server", serverId: data as string, channelId: null });
}

export async function inviteInfo(code: string) {
  const { data, error } = await supabase.rpc("fogon_invite_info", { p_code: code });
  if (error) throw error;
  return ((data ?? []) as { server_id: string; name: string; members: number; already_member: boolean }[])[0] ?? null;
}

export async function joinServer(code: string) {
  const { data, error } = await supabase.rpc("fogon_join_server", { p_code: code });
  if (error) throw error;
  await loadAll();
  go({ kind: "server", serverId: data as string, channelId: null });
}

export async function resetInvite(serverId: string) {
  const { data, error } = await supabase.rpc("fogon_reset_invite", { p_server: serverId });
  if (error) throw error;
  setState((s) => ({ servers: { ...s.servers, [serverId]: { ...s.servers[serverId], invite_code: data as string } } }));
}

export async function renameServer(serverId: string, name: string) {
  const { data, error } = await supabase.from("fogon_servers").update({ name: name.trim() }).eq("id", serverId).select("*").single();
  if (error) throw error;
  setState((s) => ({ servers: { ...s.servers, [serverId]: data as Server } }));
}

export async function deleteServer(serverId: string) {
  const { error } = await supabase.from("fogon_servers").delete().eq("id", serverId);
  if (error) throw error;
  removeServerLocal(serverId);
}

export async function leaveServer(serverId: string) {
  const { error } = await supabase.from("fogon_members").delete().match({ server_id: serverId, user_id: meId() });
  if (error) throw error;
  removeServerLocal(serverId);
}

function removeServerLocal(serverId: string) {
  setState((s) => {
    const servers = { ...s.servers };
    delete servers[serverId];
    const channels = Object.fromEntries(Object.entries(s.channels).filter(([, c]) => c.server_id !== serverId));
    return { servers, channels };
  });
  if (state.place.kind === "server" && state.place.serverId === serverId) go({ kind: "dm", channelId: null });
}

export async function banMember(serverId: string, userId: string, reason: string, deleteHours: 0 | 1 | 24 | 168) {
  const { error } = await supabase.rpc("fogon_ban", { p_server: serverId, p_user: userId, p_reason: reason.trim(), p_delete_hours: deleteHours });
  if (error) throw error;
  setState((s) => ({ members: { ...s.members, [serverId]: (s.members[serverId] ?? []).filter((u) => u !== userId) } }));
  // si se borraron mensajes, sacarlos de la vista
  if (deleteHours) {
    const since = Date.now() - deleteHours * 3600_000;
    setState((s) => {
      const messages = { ...s.messages };
      for (const [ch, cm] of Object.entries(messages)) {
        if (s.channels[ch]?.server_id !== serverId) continue;
        messages[ch] = { ...cm, list: cm.list.filter((m) => !(m.author_id === userId && new Date(m.created_at).getTime() > since)) };
      }
      return { messages };
    });
  }
}

export async function listBans(serverId: string): Promise<Ban[]> {
  const { data, error } = await supabase.from("fogon_bans").select(`*, profile:fogon_profiles!fogon_bans_user_id_fkey(${PCOLS})`).eq("server_id", serverId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Ban[];
}

export async function unban(serverId: string, userId: string) {
  const { error } = await supabase.from("fogon_bans").delete().match({ server_id: serverId, user_id: userId });
  if (error) throw error;
}

export async function kickMember(serverId: string, userId: string) {
  const { error } = await supabase.from("fogon_members").delete().match({ server_id: serverId, user_id: userId });
  if (error) throw error;
  setState((s) => ({ members: { ...s.members, [serverId]: (s.members[serverId] ?? []).filter((u) => u !== userId) } }));
}

export async function saveChannel(c: Partial<Channel> & { server_id: string; kind: "text" | "category" }) {
  const fields = { name: c.name, topic: c.topic ?? "", parent_id: c.parent_id ?? null, position: c.position ?? 0 };
  let id = c.id;
  if (id) {
    const { error } = await supabase.from("fogon_channels").update(fields).eq("id", id);
    if (error) throw error;
  } else {
    // sin RETURNING: la regla de lectura no ve la fila nueva dentro del mismo INSERT
    id = crypto.randomUUID();
    const { error } = await supabase.from("fogon_channels").insert({ ...fields, id, server_id: c.server_id, kind: c.kind });
    if (error) throw error;
  }
  const { data, error } = await supabase.from("fogon_channels").select("*").eq("id", id).single();
  if (error) throw error;
  setState((s) => ({ channels: { ...s.channels, [data.id]: data as Channel } }));
  return data as Channel;
}

export async function deleteChannel(id: string) {
  const ch = state.channels[id];
  const { error } = await supabase.from("fogon_channels").delete().eq("id", id);
  if (error) throw error;
  setState((s) => {
    const channels = { ...s.channels };
    delete channels[id];
    for (const c of Object.values(channels)) if (c.parent_id === id) channels[c.id] = { ...c, parent_id: null };
    return { channels };
  });
  if (state.place.channelId === id && ch?.server_id) go({ kind: "server", serverId: ch.server_id, channelId: null });
}

export async function openDm(userId: string) {
  const { data, error } = await supabase.rpc("fogon_open_dm", { p_other: userId });
  if (error) throw error;
  const id = data as string;
  if (!state.channels[id]) await loadAll();
  go({ kind: "dm", channelId: id });
  return id;
}

export async function findUser(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("fogon_profiles")
    .select(`${PCOLS}`)
    .eq("username", username.toLowerCase().replace(/^@/, ""))
    .maybeSingle();
  if (error) throw error;
  if (data) setState((s) => ({ profiles: { ...s.profiles, [data.id]: data } }));
  return data;
}

/* ---------- roles y permisos ---------- */

export const ALL_PERMS: Perm[] = ["manage_server", "manage_channels", "manage_roles", "manage_messages", "kick_members", "ban_members", "mention_everyone"];

export function serverRoles(s: State, serverId: string): Role[] {
  return Object.values(s.roles)
    .filter((r) => r.server_id === serverId)
    .sort((a, b) => b.position - a.position || a.created_at.localeCompare(b.created_at));
}

export function rolesOf(s: State, serverId: string, userId: string): Role[] {
  return (s.memberRoles[serverId]?.[userId] ?? [])
    .map((id) => s.roles[id])
    .filter((r): r is Role => !!r)
    .sort((a, b) => b.position - a.position);
}

export function topPosition(s: State, serverId: string, userId: string): number {
  if (s.servers[serverId]?.owner_id === userId) return 1000;
  return rolesOf(s, serverId, userId)[0]?.position ?? 0;
}

export function myPerms(s: State, serverId: string): Set<Perm> {
  const me = s.me?.id ?? "";
  if (s.servers[serverId]?.owner_id === me) return new Set(ALL_PERMS);
  return new Set(rolesOf(s, serverId, me).flatMap((r) => r.perms));
}

export function can(s: State, serverId: string | null | undefined, perm: Perm): boolean {
  return !!serverId && myPerms(s, serverId).has(perm);
}

/** Color del nombre: el del rol más alto que tenga color distinto al gris por defecto */
export function nameColor(s: State, serverId: string | null | undefined, userId: string): string | undefined {
  if (!serverId) return undefined;
  return rolesOf(s, serverId, userId).find((r) => r.color.toLowerCase() !== "#99a8a4")?.color;
}

export async function saveRole(r: Partial<Role> & { server_id: string }) {
  const fields = { name: r.name?.trim(), color: r.color, position: r.position, hoist: r.hoist, perms: r.perms, auto_assign: !!r.auto_assign };
  let id = r.id;
  if (id) {
    const { error } = await supabase.from("fogon_roles").update(fields).eq("id", id);
    if (error) throw error;
  } else {
    id = crypto.randomUUID();
    const { error } = await supabase.from("fogon_roles").insert({ ...fields, id, server_id: r.server_id });
    if (error) throw error;
  }
  await loadRoles();
  return id;
}

export async function deleteRole(id: string) {
  const { error } = await supabase.from("fogon_roles").delete().eq("id", id);
  if (error) throw error;
  await loadRoles();
}

export async function setMemberRole(serverId: string, userId: string, roleId: string, on: boolean) {
  const { error } = on
    ? await supabase.from("fogon_member_roles").insert({ server_id: serverId, user_id: userId, role_id: roleId })
    : await supabase.from("fogon_member_roles").delete().match({ user_id: userId, role_id: roleId });
  if (error && !/duplicate key/.test(error.message)) throw error;
  await loadRoles();
}

/* ---------- Realtime ---------- */

let rt: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
const reloadSoon = () => {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void loadAll(), 300);
};

let rolesTimer: ReturnType<typeof setTimeout> | null = null;
const rolesSoon = () => {
  if (rolesTimer) clearTimeout(rolesTimer);
  rolesTimer = setTimeout(() => void loadRoles(), 300);
};

function stopRealtime() {
  if (rt) void supabase.removeChannel(rt);
  rt = null;
  stopPresence();
}

function onMessageInsert(m: Message) {
  m = { ...m, attachments: m.attachments ?? [], mentions: m.mentions ?? [] };
  const me = meId();
  const ch = state.channels[m.channel_id];
  if (!ch) return reloadSoon(); // DM nuevo que me abrieron
  setState((s) => ({ channels: { ...s.channels, [ch.id]: { ...ch, last_message_at: m.created_at } } }));
  const cm = state.messages[m.channel_id];
  if (cm) setChannelMessages(m.channel_id, { list: upsertMessage(cm.list, m) });
  setState((s) => ({ reactions: { ...s.reactions, [m.id]: s.reactions[m.id] ?? [] } }));
  void ensureProfiles([m.author_id]);
  if (m.reply_to_id) void loadReplies([m]);
  if (m.author_id === me) return;
  const viewing = state.place.channelId === m.channel_id && document.visibilityState === "visible";
  if (viewing) return markRead(m.channel_id);
  const u = state.unread[m.channel_id] ?? { unread: false, mentions: 0 };
  const pinged = m.mentions.includes(me) || ch.kind === "dm";
  setState((s) => ({ unread: { ...s.unread, [m.channel_id]: { unread: true, mentions: u.mentions + (pinged ? 1 : 0) } } }));
  if (pinged) {
    notify(m);
    if (state.sounds && state.me?.status !== "dnd") ping();
  }
}

/** Sonidito de mención (dos notas cortas), hecho con Web Audio para no cargar archivos. */
let actx: AudioContext | null = null;
export function ping() {
  try {
    actx ??= new AudioContext();
    const t = actx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      o.connect(g).connect(actx!.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.18);
    });
  } catch {}
}

export function setSounds(on: boolean) {
  setState({ sounds: on });
  try {
    localStorage.setItem("fogon:sounds", on ? "1" : "0");
  } catch {}
}

function notify(m: Message) {
  if (!state.sounds) return;
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible" || state.me?.status === "dnd") return;
    const who = state.profiles[m.author_id]?.display_name ?? "Alguien";
    new Notification(who, { body: m.content.slice(0, 140) || "Mandó una imagen", tag: m.channel_id });
  } catch {}
}

function startRealtime() {
  stopRealtime();
  rt = supabase
    .channel("fogon-db")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "fogon_messages" }, (p) => onMessageInsert(p.new as Message))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fogon_messages" }, (p) => {
      const m = p.new as Message;
      const cm = state.messages[m.channel_id];
      if (cm?.list.some((x) => x.id === m.id)) setChannelMessages(m.channel_id, { list: upsertMessage(cm.list, m) });
      if (m.id in state.replyCache) setState((s) => ({ replyCache: { ...s.replyCache, [m.id]: m } }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "fogon_messages" }, (p) => {
      const id = (p.old as { id: string }).id;
      setState((s) => {
        const messages = { ...s.messages };
        for (const [cid, c] of Object.entries(messages)) if (c.list.some((x) => x.id === id)) messages[cid] = { ...c, list: c.list.filter((x) => x.id !== id) };
        return { messages, replyCache: id in s.replyCache ? { ...s.replyCache, [id]: null } : s.replyCache };
      });
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "fogon_reactions" }, (p) => {
      const r = p.new as Reaction;
      if (!(r.message_id in state.reactions)) return;
      const cur = state.reactions[r.message_id];
      if (cur.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return;
      setState((s) => ({ reactions: { ...s.reactions, [r.message_id]: [...cur, r] } }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "fogon_reactions" }, (p) => {
      const r = p.old as Reaction;
      if (!(r.message_id in state.reactions)) return;
      setState((s) => ({
        reactions: { ...s.reactions, [r.message_id]: s.reactions[r.message_id].filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)) },
      }));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_channels" }, (p) => {
      if (p.eventType === "DELETE") {
        const id = (p.old as { id: string }).id;
        if (!state.channels[id]) return;
        const ch = state.channels[id];
        setState((s) => {
          const channels = { ...s.channels };
          delete channels[id];
          return { channels };
        });
        if (state.place.channelId === id && ch.server_id) go({ kind: "server", serverId: ch.server_id, channelId: null });
        return;
      }
      const c = p.new as Channel;
      if (c.kind === "dm" && !state.channels[c.id]) return reloadSoon();
      setState((s) => ({ channels: { ...s.channels, [c.id]: c } }));
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "fogon_members" }, (p) => {
      const r = p.new as { server_id: string; user_id: string };
      if (r.user_id === meId() || !state.servers[r.server_id]) return reloadSoon();
      if ((state.members[r.server_id] ?? []).includes(r.user_id)) return;
      setState((s) => ({ members: { ...s.members, [r.server_id]: [...(s.members[r.server_id] ?? []), r.user_id] } }));
      void ensureProfiles([r.user_id]);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_badges" }, () => badgesSoon())
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_friends" }, () => friendsSoon())
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_channel_overrides" }, () => reloadSoon())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fogon_profiles" }, (p) => {
      const np = p.new as Profile;
      if (!state.profiles[np.id]) return;
      setState((s) => ({ profiles: { ...s.profiles, [np.id]: { ...s.profiles[np.id], ...np } }, ...(np.id === s.me?.id ? { me: { ...s.me!, ...np } } : {}) }));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_roles" }, () => rolesSoon())
    .on("postgres_changes", { event: "*", schema: "public", table: "fogon_member_roles" }, () => rolesSoon())
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "fogon_servers" }, (p) => {
      const sv = p.new as Server;
      if (state.servers[sv.id]) setState((s) => ({ servers: { ...s.servers, [sv.id]: sv } }));
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "fogon_servers" }, (p) => {
      const id = (p.old as { id: string }).id;
      if (state.servers[id]) removeServerLocal(id);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setState({ online: true });
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState({ online: false });
    });
}

/* ---------- utilidades para la UI ---------- */

export function channelLabel(c: Channel | undefined): string {
  if (!c) return "";
  if (c.kind === "dm") {
    const peer = state.profiles[state.dmPeers[c.id]];
    return peer ? peer.display_name : "Mensaje directo";
  }
  return c.name;
}

export function serverUnread(s: State, serverId: string): Unread {
  let unread = false;
  let mentions = 0;
  for (const c of Object.values(s.channels)) {
    if (c.server_id !== serverId || c.kind !== "text") continue;
    const u = s.unread[c.id];
    if (u?.unread) unread = true;
    mentions += u?.mentions ?? 0;
  }
  return { unread, mentions };
}

export function dmUnread(s: State): number {
  let n = 0;
  for (const c of Object.values(s.channels)) if (c.kind === "dm") n += s.unread[c.id]?.mentions ?? 0;
  return n;
}

/* ---------- insignias ---------- */

export async function loadBadges() {
  const [b, a] = await Promise.all([
    supabase.from("fogon_badges").select("user_id,badge"),
    supabase.from("fogon_admins").select("user_id").eq("user_id", meId()).maybeSingle(),
  ]);
  if (b.error) return console.warn(b.error);
  const map: Record<string, string[]> = {};
  for (const r of b.data as { user_id: string; badge: string }[]) (map[r.user_id] ??= []).push(r.badge);
  setState({ badges: map, isAdmin: !!a.data });
}

let badgeTimer: ReturnType<typeof setTimeout> | undefined;
const badgesSoon = () => {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => void loadBadges(), 250);
};

export async function setBadge(userId: string, badge: string, on: boolean) {
  const before = state.badges;
  const cur = new Set(before[userId] ?? []);
  if (on) cur.add(badge);
  else cur.delete(badge);
  setState({ badges: { ...before, [userId]: [...cur] } });
  const { error } = on
    ? await supabase.from("fogon_badges").insert({ user_id: userId, badge })
    : await supabase.from("fogon_badges").delete().eq("user_id", userId).eq("badge", badge);
  if (error && error.code !== "23505") {
    setState({ badges: before });
    fail(error);
  }
}

/* ---------- amigos y bloqueos ---------- */

export async function loadFriends() {
  const me = meId();
  const [f, b] = await Promise.all([supabase.from("fogon_friends").select("*"), supabase.from("fogon_blocks").select("blocked")]);
  if (f.error) return console.warn(f.error);
  const rel: Record<string, Relation> = {};
  for (const r of f.data as { requester: string; addressee: string; status: string; created_at: string; accepted_at: string | null }[]) {
    const other = r.requester === me ? r.addressee : r.requester;
    rel[other] = r.status === "accepted" ? { status: "friend", since: r.accepted_at ?? r.created_at } : { status: r.requester === me ? "outgoing" : "incoming", since: r.created_at };
  }
  const blocked: Record<string, true> = {};
  for (const r of (b.data ?? []) as { blocked: string }[]) blocked[r.blocked] = true;
  setState({ relations: rel, blocked });
  await ensureProfiles([...Object.keys(rel), ...Object.keys(blocked)]);
}

let friendsTimer: ReturnType<typeof setTimeout> | undefined;
const friendsSoon = () => {
  clearTimeout(friendsTimer);
  friendsTimer = setTimeout(() => void loadFriends(), 250);
};

export async function sendFriendRequest(username: string): Promise<string> {
  const { data, error } = await supabase.rpc("fogon_friend_request", { p_username: username.trim() });
  if (error) throw error;
  await loadFriends();
  return data as string;
}

export async function acceptFriend(userId: string) {
  const { error } = await supabase.rpc("fogon_friend_accept", { p_other: userId });
  if (error) throw error;
  await loadFriends();
}

/** Eliminar amigo, cancelar o rechazar una solicitud. */
export async function removeFriend(userId: string) {
  const me = meId();
  const before = state.relations;
  const next = { ...before };
  delete next[userId];
  setState({ relations: next });
  const { error } = await supabase
    .from("fogon_friends")
    .delete()
    .or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`);
  if (error) {
    setState({ relations: before });
    throw error;
  }
}

export async function blockUser(userId: string) {
  const { error } = await supabase.rpc("fogon_block", { p_other: userId });
  if (error) throw error;
  await loadFriends();
}

export async function unblockUser(userId: string) {
  const { error } = await supabase.from("fogon_blocks").delete().match({ blocker: meId(), blocked: userId });
  if (error) throw error;
  await loadFriends();
}

export const pendingIncoming = (s: State) => Object.values(s.relations).filter((r) => r.status === "incoming").length;

/* ---------- fijados y búsqueda ---------- */

export async function pinMessage(m: Message, on: boolean) {
  const { error } = await supabase.rpc("fogon_pin", { p_message: m.id, p_on: on });
  if (error) throw error;
  patchMessage(m.channel_id, m.id, { pinned_at: on ? new Date().toISOString() : null, pinned_by: on ? meId() : null });
  toast(on ? "Mensaje fijado" : "Se desfijó el mensaje");
}

export async function listPins(channelId: string): Promise<Message[]> {
  const { data, error } = await supabase.from("fogon_messages").select("*").eq("channel_id", channelId).not("pinned_at", "is", null).order("pinned_at", { ascending: false });
  if (error) throw error;
  const msgs = data as Message[];
  await ensureProfiles(msgs.map((m) => m.author_id));
  return msgs.map((m) => ({ ...m, attachments: m.attachments ?? [], mentions: m.mentions ?? [] }));
}

/** Busca en los canales que ves de un servidor (o en un DM). Admite "de:@usuario". */
export async function searchMessages(channelIds: string[], raw: string): Promise<Message[]> {
  let q = raw.trim();
  let author: string | null = null;
  const m = /(?:^|\s)de:@?([a-z0-9_.]+)/i.exec(q);
  if (m) {
    const p = Object.values(state.profiles).find((x) => x.username === m[1].toLowerCase());
    author = p?.id ?? "00000000-0000-0000-0000-000000000000";
    q = q.replace(m[0], " ").trim();
  }
  if (!channelIds.length) return [];
  let query = supabase.from("fogon_messages").select("*").in("channel_id", channelIds).order("created_at", { ascending: false }).limit(25);
  if (q) query = query.ilike("content", `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
  if (author) query = query.eq("author_id", author);
  const { data, error } = await query;
  if (error) throw error;
  const msgs = (data as Message[]).map((x) => ({ ...x, attachments: x.attachments ?? [], mentions: x.mentions ?? [] }));
  await ensureProfiles(msgs.map((x) => x.author_id));
  return msgs;
}

export function jumpToMessage(m: Message) {
  const ch = state.channels[m.channel_id];
  if (!ch) return;
  go(ch.server_id ? { kind: "server", serverId: ch.server_id, channelId: ch.id } : { kind: "dm", channelId: ch.id });
  setState({ jumpTo: m.id });
}

export function openSettings(v: SettingsView | null) {
  setState({ settings: v });
}

/* ---------- permisos por categoría / canal ---------- */

function groupOverrides(rows: Override[]) {
  const map: Record<string, Override[]> = {};
  for (const o of rows) (map[o.channel_id] ??= []).push(o);
  return map;
}

/** Igual que fogon_channel_allows en la base: categoría y después canal; @everyone y después roles. */
export function channelAllows(s: State, channelId: string, perm: ChanPerm): boolean {
  const c = s.channels[channelId];
  if (!c || c.kind === "dm" || !c.server_id) return true;
  if (s.servers[c.server_id]?.owner_id === s.me?.id || can(s, c.server_id, "manage_channels")) return true;
  const mine = new Set(s.memberRoles[c.server_id]?.[s.me?.id ?? ""] ?? []);
  let ok = true;
  for (const lvl of [c.parent_id, c.id]) {
    if (!lvl) continue;
    const list = s.overrides[lvl] ?? [];
    const ev = list.find((o) => !o.role_id);
    if (ev?.deny.includes(perm)) ok = false;
    if (ev?.allow.includes(perm)) ok = true;
    const rs = list.filter((o) => o.role_id && mine.has(o.role_id));
    if (rs.some((o) => o.deny.includes(perm))) ok = false;
    if (rs.some((o) => o.allow.includes(perm))) ok = true;
  }
  if (perm !== "view_channel" && ok) return channelAllows(s, channelId, "view_channel");
  return ok;
}

/** Cambia un permiso para @everyone (roleId null) o un rol: permitir, denegar o heredar. */
export async function setOverride(serverId: string, channelId: string, roleId: string | null, perm: ChanPerm, value: "allow" | "deny" | "inherit") {
  const list = state.overrides[channelId] ?? [];
  const cur = list.find((o) => (o.role_id ?? null) === roleId);
  const allow = (cur?.allow ?? []).filter((p) => p !== perm);
  const deny = (cur?.deny ?? []).filter((p) => p !== perm);
  if (value === "allow") allow.push(perm);
  if (value === "deny") deny.push(perm);
  const before = state.overrides;
  const optimistic: Override = { id: cur?.id ?? crypto.randomUUID(), server_id: serverId, channel_id: channelId, role_id: roleId, allow, deny };
  setState({ overrides: { ...before, [channelId]: [...list.filter((o) => o !== cur), optimistic] } });
  const res = cur
    ? await supabase.from("fogon_channel_overrides").update({ allow, deny }).eq("id", cur.id)
    : await supabase.from("fogon_channel_overrides").insert({ id: optimistic.id, server_id: serverId, channel_id: channelId, role_id: roleId, allow, deny });
  if (res.error) {
    setState({ overrides: before });
    throw res.error;
  }
}

/** Saca todos los permisos propios de un rol en esa categoría / canal. */
export async function removeOverride(channelId: string, roleId: string | null) {
  const list = state.overrides[channelId] ?? [];
  const cur = list.find((o) => (o.role_id ?? null) === roleId);
  if (!cur) return;
  setState((s) => ({ overrides: { ...s.overrides, [channelId]: list.filter((o) => o !== cur) } }));
  const { error } = await supabase.from("fogon_channel_overrides").delete().eq("id", cur.id);
  if (error) throw error;
}
