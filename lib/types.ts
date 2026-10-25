export type Profile = {
  id: string;
  username: string;
  display_name: string;
  color: string;
  created_at?: string;
  bio?: string;
  pronouns?: string;
  banner_color?: string | null;
  theme_top?: string | null;
  theme_bottom?: string | null;
  avatar_path?: string | null;
  banner_path?: string | null;
  status?: Status;
  custom_status?: string;
  is_bot?: boolean;
  is_official?: boolean;
  deleted_at?: string | null;
  premium?: boolean;
  name_style?: "gradiente" | "brillo" | "arcoiris" | null;
  name_c1?: string | null;
  name_c2?: string | null;
  avatar_deco?: import("./decos").AvatarDeco | null;
  profile_effect?: "chispas" | "nieve" | "corazones" | "brasas" | "estrellas" | null;
  app_theme?: "medianoche" | "atardecer" | "aurora" | "fogon" | "rosa" | "oceano" | "bosque" | null;
  app_accent?: string | null;
};

export type Status = "online" | "idle" | "dnd" | "invisible";
export type Presence = "online" | "idle" | "dnd" | "offline";

export type Server = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  icon_url?: string | null;
  everyone_perms?: Perm[];
  boost_count?: number;
  banner_color?: string | null;
  invite_vanity?: boolean;
  is_public?: boolean;
  is_official?: boolean;
  description?: string;
  tags?: string[];
};

export type ChannelKind = "text" | "category" | "dm" | "voice" | "thread";

/** Quién está en un canal de voz (viaja en la presencia global). */
export type VoiceState = { ch: string; muted: boolean; deafened: boolean; screen?: boolean };

export type Channel = {
  id: string;
  server_id: string | null;
  kind: ChannelKind;
  name: string;
  topic: string;
  position: number;
  parent_id: string | null;
  last_message_at: string | null;
  created_at: string;
  /** hilos: el mensaje de donde salió, quién lo abrió y si está archivado */
  starter_id?: string | null;
  owner_id?: string | null;
  archived?: boolean;
};

export type Attachment = {
  path: string;
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
};

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  attachments: Attachment[];
  mentions: string[];
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  /** solo en el cliente */
  status?: "sending" | "failed";
  /** archivos locales mientras se suben */
  localFiles?: { url: string; name: string }[];
};

export type Unread = { unread: boolean; mentions: number };

/** Dónde está parado el usuario */
export type Place = { kind: "server"; serverId: string; channelId: string | null } | { kind: "dm"; channelId: string | null };

export type Perm =
  | "view_channel" | "manage_channels" | "manage_roles" | "manage_server" | "manage_emojis" | "view_audit_log" | "create_invite"
  | "kick_members" | "ban_members" | "moderate_members"
  | "send_messages" | "add_reactions" | "attach_files" | "mention_everyone" | "manage_messages" | "create_threads" | "manage_threads" | "create_polls"
  | "connect" | "speak" | "video" | "mute_members" | "deafen_members" | "move_members"
  | "administrator";

export type PermGroup = "general" | "members" | "text" | "voice" | "advanced";
export const PERM_GROUPS: { id: PermGroup; label: string }[] = [
  { id: "general", label: "Permisos generales del servidor" },
  { id: "members", label: "Permisos de miembros" },
  { id: "text", label: "Permisos de canales de texto" },
  { id: "voice", label: "Permisos de canales de voz" },
  { id: "advanced", label: "Permisos avanzados" },
];

export const PERMS: { id: Perm; label: string; help: string; group: PermGroup }[] = [
  { id: "view_channel", group: "general", label: "Ver canales", help: "Ver los canales de texto y de voz (salvo los que sean privados)." },
  { id: "manage_channels", group: "general", label: "Administrar canales", help: "Crear, editar y borrar canales y categorías." },
  { id: "manage_roles", group: "general", label: "Administrar roles", help: "Crear y asignar roles por debajo del suyo, sin dar permisos que no tenga." },
  { id: "manage_server", group: "general", label: "Administrar el servidor", help: "Cambiar el nombre, el ícono y generar un link de invitación nuevo." },
  { id: "manage_emojis", group: "general", label: "Administrar emojis", help: "Subir, renombrar y borrar los emojis propios del servidor." },
  { id: "view_audit_log", group: "general", label: "Ver el registro de auditoría", help: "Ver quién cambió qué en el servidor (roles, canales, baneos, aislamientos...)." },
  { id: "create_invite", group: "members", label: "Crear invitación", help: "Invitar gente nueva al servidor." },
  { id: "kick_members", group: "members", label: "Expulsar miembros", help: "Sacar del servidor a quien tenga un rol más bajo." },
  { id: "ban_members", group: "members", label: "Banear miembros", help: "Sacar y prohibir volver a quien tenga un rol más bajo, y ver la lista de baneados." },
  { id: "moderate_members", group: "members", label: "Aislar miembros", help: "Dejar a alguien de solo lectura por un rato (no escribe, no reacciona, no habla)." },
  { id: "send_messages", group: "text", label: "Enviar mensajes", help: "Escribir en los canales de texto." },
  { id: "add_reactions", group: "text", label: "Añadir reacciones", help: "Reaccionar con emojis a los mensajes." },
  { id: "attach_files", group: "text", label: "Adjuntar archivos", help: "Subir imágenes a los mensajes." },
  { id: "mention_everyone", group: "text", label: "Mencionar @everyone", help: "Avisar a todos los miembros a la vez." },
  { id: "manage_messages", group: "text", label: "Administrar mensajes", help: "Borrar mensajes de otras personas y fijar mensajes." },
  { id: "create_threads", group: "text", label: "Crear hilos", help: "Abrir un hilo a partir de un mensaje para charlar aparte." },
  { id: "manage_threads", group: "text", label: "Administrar hilos", help: "Renombrar, cerrar y borrar hilos de otras personas." },
  { id: "create_polls", group: "text", label: "Crear encuestas", help: "Mandar encuestas para que voten los demás." },
  { id: "connect", group: "voice", label: "Conectarse", help: "Entrar a los canales de voz." },
  { id: "speak", group: "voice", label: "Hablar", help: "Que lo escuchen en los canales de voz. Sin esto entra silenciado." },
  { id: "video", group: "voice", label: "Video", help: "Prender la cámara en los canales de voz." },
  { id: "mute_members", group: "voice", label: "Silenciar miembros", help: "Silenciar a otros en todos los canales de voz del servidor." },
  { id: "deafen_members", group: "voice", label: "Ensordecer miembros", help: "Hacer que otros no escuchen nada en los canales de voz del servidor." },
  { id: "move_members", group: "voice", label: "Mover miembros", help: "Pasar gente de un canal de voz a otro (arrastrándola)." },
  { id: "administrator", group: "advanced", label: "Administrador", help: "Tiene TODOS los permisos y se saltea los permisos de canal. Es peligroso: dalo con cuidado." },
];

/** Lo que tiene todo el mundo por defecto en un servidor nuevo (@everyone). */
export const EVERYONE_DEFAULT: Perm[] = ["view_channel", "create_invite", "send_messages", "add_reactions", "attach_files", "create_threads", "create_polls", "connect", "speak", "video"];

export type Role = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  perms: Perm[];
  auto_assign?: boolean;
  created_at: string;
};

export type Ban = { server_id: string; user_id: string; reason: string; banned_by: string | null; created_at: string; profile?: Profile | null };

export type Relation = { status: "friend" | "incoming" | "outgoing"; since: string };
export type SettingsView = { kind: "user"; section: string } | { kind: "server"; serverId: string; section: string };

export type ChanPerm = "view_channel" | "send_messages" | "add_reactions" | "attach_files" | "create_threads" | "create_polls" | "connect" | "speak" | "video";
export const CHAN_PERMS: { id: ChanPerm; label: string; help: string; kinds: ("text" | "voice")[] }[] = [
  { id: "view_channel", label: "Ver canal", help: "Quien no lo tenga no ve el canal (ni sus mensajes o quién está conectado).", kinds: ["text", "voice"] },
  { id: "send_messages", label: "Enviar mensajes", help: "Escribir en el canal. Sin esto, queda de solo lectura.", kinds: ["text"] },
  { id: "add_reactions", label: "Añadir reacciones", help: "Reaccionar con emojis a los mensajes.", kinds: ["text"] },
  { id: "attach_files", label: "Adjuntar archivos", help: "Subir imágenes a los mensajes.", kinds: ["text"] },
  { id: "create_threads", label: "Crear hilos", help: "Abrir hilos desde los mensajes del canal.", kinds: ["text"] },
  { id: "create_polls", label: "Crear encuestas", help: "Mandar encuestas en el canal.", kinds: ["text"] },
  { id: "connect", label: "Conectarse", help: "Entrar al canal de voz.", kinds: ["voice"] },
  { id: "speak", label: "Hablar", help: "Que lo escuchen. Sin esto entra silenciado.", kinds: ["voice"] },
  { id: "video", label: "Video", help: "Prender la cámara.", kinds: ["voice"] },
];
export type Override = { id: string; server_id: string; channel_id: string; role_id: string | null; allow: ChanPerm[]; deny: ChanPerm[] };

export type Boost = { user_id: string; slot: number; server_id: string | null; boosted_at: string | null };

export type CustomEmoji = { id: string; server_id: string; name: string; path: string; animated: boolean; created_by: string | null; created_at: string };

export type PollOption = { id: number; text: string; emoji: string | null };
export type Poll = { message_id: string; channel_id: string; question: string; options: PollOption[]; multi: boolean; ends_at: string; created_at: string };
export type PollVote = { user_id: string; option_id: number };

export type Timeout = { server_id: string; user_id: string; until: string; reason: string; by_id: string | null; at: string };
export type AuditEntry = {
  id: number; server_id: string; actor_id: string | null; action: string;
  target_type: string | null; target_id: string | null; target_name: string | null; details: Record<string, unknown>; at: string;
};

export type VoiceMod = { server_id: string; user_id: string; muted: boolean; deafened: boolean };
