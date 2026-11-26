import { Injectable, inject, signal } from '@angular/core';

import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

/** Backend cap, mirrored from models.IncomingMessage. */
const MAX_CONTENT = 500;

/**
 * How long a typing signal stays on screen without a refresh. The sender
 * re-sends while it keeps typing, so a lost "stopped" frame only leaves the
 * indicator up for this long.
 */
const TYPING_TIMEOUT_MS = 6000;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly authService = inject(AuthService);
  private readonly config = inject(ApiConfigService);
  private readonly userService = inject(UserService);

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  readonly connected = signal(false);
  /** Whether any connection has opened since the last explicit disconnect. */
  readonly everConnected = signal(false);
  /** Last error the server pushed back over the socket. */
  readonly lastError = signal<string | null>(null);
  /** Everything received on the socket; views filter it down to their room. */
  readonly incoming = signal<MessageBroadcast[]>([]);

  /** Active typing signals, keyed by room and author; expired on a timer. */
  readonly typing = signal<TypingBroadcast[]>([]);
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Idempotent, and deliberately app-scoped rather than per-view: the socket
   * carries the user's whole session, so it must outlive any one route. Calling
   * this from every component that renders messages used to open a new socket
   * each time a room was entered, and the server broadcast to all of them.
   */
  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnect();

    // The handshake cannot carry an Authorization header from a browser, so the
    // token rides in the query string — the backend accepts it only for upgrades.
    const base = this.config.websocketBase();
    const socket = new WebSocket(`${base}/chat?token=${encodeURIComponent(token)}`);
    this.socket = socket;

    socket.onopen = () => {
      this.connected.set(true);
      this.everConnected.set(true);
      this.lastError.set(null);
    };

    socket.onmessage = event => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const message = payload as Partial<MessageBroadcast> & { message?: string; type?: string };

      // Validation and service failures come back as { message }, not as a
      // message broadcast.
      if (message.message) {
        this.lastError.set(message.message);
        return;
      }

      // A typing frame is tagged so it is not mistaken for a message; it never
      // enters the message buffer.
      if (message.type === 'typing') {
        this.applyTyping(message as unknown as TypingBroadcast);
        return;
      }

      // A presence frame updates another user's dot; it is not a message either.
      if (message.type === 'status') {
        const status = message as unknown as StatusBroadcast;
        this.userService.setStatus(status.author, status.status);
        return;
      }

      this.incoming.update(current => [...current, message as MessageBroadcast]);
    };

    socket.onerror = () => {
      this.connected.set(false);
    };

    socket.onclose = () => {
      this.connected.set(false);
      this.clearTyping();
      // Presence is a snapshot of the live connection; a dropped socket makes it
      // stale, and the reconnect's snapshot repopulates it.
      this.userService.clearStatuses();
      this.socket = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };
  }

  	/** False when the socket is not open, so the caller can show it to the user. */
  	sendMessage(roomId: string, content: string, replyToId?: number | null): boolean {
  		const body = content.trim();
  		if (!body || body.length > MAX_CONTENT || this.socket?.readyState !== WebSocket.OPEN) {
  			return false;
  		}

  		this.lastError.set(null);
  		this.socket.send(JSON.stringify({ room_id: roomId, content: body, reply_to_id: replyToId ?? null }));
  		return true;
  	}

  /**
   * Relays a typing-state change. A "started" signal is kept until the sender
   * says otherwise or the timeout fires, so a dropped "stopped" frame cannot
   * leave the indicator stuck.
   */
  sendTyping(roomId: string, typing: boolean): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'typing', room_id: roomId, typing }));
  }

  /** Announces the signed-in user's availability to the other clients. */
  sendStatus(status: UserStatus): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ type: 'status', status }));
  }

  private applyTyping(event: TypingBroadcast): void {
    const key = `${event.room_id}\u0000${event.author}`;
    this.clearTypingTimer(key);

    if (!event.typing) {
      this.typing.update(list => list.filter(item => `${item.room_id}\u0000${item.author}` !== key));
      return;
    }

    this.typing.update(list => [
      ...list.filter(item => `${item.room_id}\u0000${item.author}` !== key),
      event,
    ]);

    this.typingTimers.set(
      key,
      setTimeout(() => {
        this.typingTimers.delete(key);
        this.typing.update(list => list.filter(item => `${item.room_id}\u0000${item.author}` !== key));
      }, TYPING_TIMEOUT_MS),
    );
  }

  private clearTypingTimer(key: string): void {
    const timer = this.typingTimers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.typingTimers.delete(key);
    }
  }

  private clearTyping(): void {
    for (const timer of this.typingTimers.values()) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();
    this.typing.set([]);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.clearTyping();
    this.userService.clearStatuses();
    this.socket?.close();
    this.socket = null;
    this.connected.set(false);
    this.everConnected.set(false);
    this.incoming.set([]);
  }

  /** Drops the buffered messages, so a room change cannot show the previous one. */
  clearIncoming(): void {
    this.incoming.set([]);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
