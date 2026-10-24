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
};

export type Status = "online" | "idle" | "dnd" | "invisible";
export type Presence = "online" | "idle" | "dnd" | "offline";

export type Server = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type ChannelKind = "text" | "category" | "dm";

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
  /** solo en el cliente */
  status?: "sending" | "failed";
  /** archivos locales mientras se suben */
  localFiles?: { url: string; name: string }[];
};

export type Unread = { unread: boolean; mentions: number };

/** Dónde está parado el usuario */
export type Place = { kind: "server"; serverId: string; channelId: string | null } | { kind: "dm"; channelId: string | null };

export type Perm = "manage_server" | "manage_channels" | "manage_roles" | "manage_messages" | "kick_members" | "mention_everyone";

export const PERMS: { id: Perm; label: string; help: string }[] = [
  { id: "manage_channels", label: "Administrar canales", help: "Crear, editar y borrar canales y categorías." },
  { id: "manage_messages", label: "Administrar mensajes", help: "Borrar mensajes de otras personas." },
  { id: "kick_members", label: "Echar miembros", help: "Sacar del servidor a quien tenga un rol más bajo." },
  { id: "manage_roles", label: "Administrar roles", help: "Crear y asignar roles por debajo del suyo, sin dar permisos que no tenga." },
  { id: "manage_server", label: "Administrar el servidor", help: "Cambiar el nombre y generar un link de invitación nuevo." },
  { id: "mention_everyone", label: "Mencionar a @everyone", help: "Avisar a todos los miembros a la vez." },
];

export type Role = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  perms: Perm[];
  created_at: string;
};
