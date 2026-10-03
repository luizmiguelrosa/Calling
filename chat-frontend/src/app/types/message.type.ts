interface MessageBroadcast {
  room_id: string;
  author: string; // User ID of sender
  content: string;
  sentAt: string; // ISO timestamp
}

interface IncomingMessage {
  room_id: string; // min 3 chars
  content: string; // max 500 chars
}
