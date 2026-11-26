export interface MessageBroadcast {
  /** The stored row id. A reply references it and the view scrolls to it. */
  id: number;
  room_id: string;
  author: string; // User ID of sender
  content: string;
  /** True when `content` is a JSON FileAttachment rather than free text. */
  is_file?: boolean;
  /** The quoted message when this one is a reply. */
  reply_to?: ReplyReference;
  sentAt: string; // ISO timestamp
}

/**
 * The quoted message a reply carries: enough to render the preview, plus the
 * room it lives in so a click can navigate back to it.
 */
export interface ReplyReference {
  id: number;
  room_id: string;
  author: string;
  content: string;
  is_file?: boolean;
}

/**
 * The JSON a file message carries in `content`: the original name, the server
 * path it is served from, its on-disk format (images render inline, anything
 * else downloads), and the hash the client recomputes to verify the download
 * arrived intact.
 */
export interface FileAttachment {
  file_name: string;
  path: string;
  hash: string;
  /**
   * The on-disk extension. Older file messages predate it and are always
   * images.
   */
  format?: string;
  message?: string;
}

/** What an upload returns: the id to reference in a message, plus its metadata. */
export interface FileResponse {
  id: string;
  file_name: string;
  path: string;
  hash: string;
  format?: string;
}

/** One message of a batch send; a file message references an uploaded file id. */
export interface BatchMessageInput {
  content: string;
  is_file?: boolean;
  file_id?: string;
  reply_to_id?: number | null;
}

export interface IncomingMessage {
  room_id: string; // min 3 chars
  content: string; // max 500 chars
  reply_to_id?: number | null;
}

/**
 * A typing-state change relayed over the socket. The `type` tag keeps it from
 * being mistaken for a message broadcast, which has no `type`.
 */
export interface TypingBroadcast {
  type: 'typing';
  room_id: string;
  author: string; // User ID of the sender
  typing: boolean;
}
