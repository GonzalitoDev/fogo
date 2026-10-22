export type Profile = {
  id: string;
  username: string;
  display_name: string;
  color: string;
};

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
