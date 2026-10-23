interface MessageBroadcast {
  room_id: string;
  author: string; // User ID of sender
  content: string;
  /** True when `content` is a JSON FileAttachment rather than free text. */
  is_file?: boolean;
  sentAt: string; // ISO timestamp
}

/**
 * The JSON a file message carries in `content`: the original name, the server
 * path it is served from, its on-disk format (images render inline, anything
 * else downloads), and the hash the client recomputes to verify the download
 * arrived intact.
 */
interface FileAttachment {
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
interface FileResponse {
  id: string;
  file_name: string;
  path: string;
  hash: string;
  format?: string;
}

/** One message of a batch send; a file message references an uploaded file id. */
interface BatchMessageInput {
  content: string;
  is_file?: boolean;
  file_id?: string;
}

interface IncomingMessage {
  room_id: string; // min 3 chars
  content: string; // max 500 chars
}

/**
 * A typing-state change relayed over the socket. The `type` tag keeps it from
 * being mistaken for a message broadcast, which has no `type`.
 */
interface TypingBroadcast {
  type: 'typing';
  room_id: string;
  author: string; // User ID of the sender
  typing: boolean;
}
