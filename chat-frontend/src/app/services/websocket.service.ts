import { Injectable, inject, signal } from '@angular/core';

import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

/** Backend cap, mirrored from models.IncomingMessage. */
const MAX_CONTENT = 500;

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private readonly authService = inject(AuthService);
  private readonly config = inject(ApiConfigService);

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

      const message = payload as Partial<MessageBroadcast> & { message?: string };

      // Validation and service failures come back as { message }, not as a
      // message broadcast.
      if (message.message) {
        this.lastError.set(message.message);
        return;
      }

      this.incoming.update(current => [...current, message as MessageBroadcast]);
    };

    socket.onerror = () => {
      this.connected.set(false);
    };

    socket.onclose = () => {
      this.connected.set(false);
      this.socket = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };
  }

  /** False when the socket is not open, so the caller can show it to the user. */
  sendMessage(roomId: string, content: string): boolean {
    const body = content.trim();
    if (!body || body.length > MAX_CONTENT || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.lastError.set(null);
    this.socket.send(JSON.stringify({ room_id: roomId, content: body }));
    return true;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
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
