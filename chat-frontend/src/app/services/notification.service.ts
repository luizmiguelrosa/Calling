import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

import { AuthService } from './auth.service';
import { ConversationService } from './conversation.service';
import { MentionService } from './mention.service';
import { RoomService } from './room.service';
import { StatusService } from './status.service';
import { UserService } from './user.service';
import { WebSocketService } from './websocket.service';
import { WindowService } from './window.service';

const BLOCKED_ROOMS_KEY = 'calling_blocked_rooms';

/** The payload carried by a native notification, so a click can reopen its room. */
interface NotificationExtra {
  roomId?: string;
  isDm?: boolean;
}

/**
 * Owns everything about being told a message arrived: the per-room unread counts,
 * the per-room mute list, and the native feedback — the taskbar flash plus an OS
 * notification.
 *
 * It watches the app-scoped socket rather than any one view, because a message
 * has to be announced whether or not its room is on screen. The suppression
 * rules live here too, so a muted room or Do Not Disturb silences the native
 * feedback — the unread count is the one signal that always survives, which is
 * what keeps the room list honest while notifications are off.
 *
 * The OS notification is the only announcement: clicking it focuses the window
 * and opens the conversation it came from, which is what the in-app toast used
 * to do.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly socket = inject(WebSocketService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly status = inject(StatusService);
  private readonly conversations = inject(ConversationService);
  private readonly userService = inject(UserService);
  private readonly roomService = inject(RoomService);
  private readonly windowService = inject(WindowService);
  private readonly mentions = inject(MentionService);

  /** Unread count per room id; a room absent from the map has none. */
  readonly unread = signal<Record<string, number>>({});

  /** Rooms the user muted individually. Persisted so a restart keeps the choice. */
  readonly blockedRooms = signal<ReadonlySet<string>>(this.readBlocked());

  /** Public room names, resolved lazily so a notification can title a room message. */
  private readonly roomNames = signal<Record<string, string>>({});

  /** How many entries of `socket.incoming()` have already been announced. */
  private processed = 0;
  private roomNamesLoaded = false;
  private activeRoomId: string | null = null;

  constructor() {
    effect(() => {
      const incoming = this.socket.incoming();

      // `clearIncoming` resets the buffer; the cursor has to follow it or the
      // next message would be skipped.
      if (incoming.length < this.processed) {
        this.processed = 0;
      }

      const fresh = incoming.slice(this.processed);
      this.processed = incoming.length;

      for (const message of fresh) {
        this.handle(message);
      }
    });

    // Resolve the public room names as soon as the session is live, so the first
    // room notification already carries its `#name` instead of falling back to
    // the author. The fetch needs the token, so it waits for the socket.
    effect(() => {
      if (this.socket.connected()) {
        this.ensureRoomNames();
      }
    });

    this.listenForClicks();
  }

  /** The room currently on screen, so its unread count is cleared as it arrives. */
  setActiveRoom(roomId: string | null): void {
    this.activeRoomId = roomId;

    if (roomId) {
      this.markRead(roomId);
    }
  }

  unreadFor(roomId: string): number {
    return this.unread()[roomId] ?? 0;
  }

  markRead(roomId: string): void {
    this.unread.update(counts => {
      if (!(roomId in counts)) {
        return counts;
      }

      const next = { ...counts };
      delete next[roomId];
      return next;
    });
  }

  isBlocked(roomId: string): boolean {
    return this.blockedRooms().has(roomId);
  }

  toggleBlock(roomId: string): void {
    this.blockedRooms.update(current => {
      const next = new Set(current);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }

      localStorage.setItem(BLOCKED_ROOMS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  private handle(message: MessageBroadcast): void {
    const currentUserId = this.authService.getUserId();

    // Own messages are never announced.
    if (!currentUserId || message.author === currentUserId) {
      return;
    }

    // A notification fires for every room, including the one on screen: the
    // window may be minimized or behind another app, so the room being "active"
    // says nothing about whether the user is actually looking at it. Unread is
    // the signal that stays room-scoped, since the room on screen is read as it
    // arrives and needs no badge.
    if (message.room_id !== this.activeRoomId) {
      this.unread.update(counts => ({
        ...counts,
        [message.room_id]: (counts[message.room_id] ?? 0) + 1,
      }));
    }

    // Do Not Disturb and a muted room silence the native feedback; the unread
    // count above is the only feedback that remains. A mention is announced
    // through the same path, so the same rules apply — the mention badge tracked
    // by `MentionService` is what survives when the notification is silenced.
    if (this.status.isDnd() || this.blockedRooms().has(message.room_id)) {
      return;
    }

    const { title, body, isDm } = this.describe(message, this.mentions.mentionsMe(message));
    void this.announce(title, body, message.room_id, isDm);
  }

  /**
   * Reaches the user through the OS. The taskbar flash is only meaningful while
   * the window is out of sight, so `requestAttention` skips a focused, visible
   * window on its own; the notification itself is posted either way, since it is
   * now the only announcement a message gets.
   */
  private async announce(title: string, body: string, roomId: string, isDm: boolean): Promise<void> {
    await this.windowService.requestAttention();
    await this.sendNative(title, body, roomId, isDm);
  }

  private async sendNative(
    title: string,
    body: string,
    roomId: string,
    isDm: boolean,
  ): Promise<void> {
    // The plugin only exists inside the Tauri shell; a browser tab has no OS
    // notification channel.
    if (!isTauri()) {
      return;
    }

    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }

      if (granted) {
        // The room travels in `extra` so a click can reopen it: the notification
        // is the only place the announcement lives, and acting on it has to land
        // on the conversation it came from.
        sendNotification({ title, body, extra: { roomId, isDm } });
      }
    } catch (err) {
      console.error('NotificationService: native notification failed', err);
    }
  }

  /**
   * A click on a notification focuses the window and opens the conversation it
   * came from. The listener has to exist before the notification is shown —
   * desktop notifications only report their actions while a listener is
   * registered — which is why it is set up at construction.
   */
  private listenForClicks(): void {
    if (!isTauri()) {
      return;
    }

    void onAction(event => {
      if (event.actionId !== 'tap') {
        return;
      }

      const extra = event.notification?.extra as NotificationExtra | undefined;
      const roomId = extra?.roomId;
      if (!roomId) {
        return;
      }

      void this.openRoom(roomId, extra?.isDm === true);
    }).catch(err => {
      console.error('NotificationService: could not listen for notification clicks', err);
    });
  }

  private async openRoom(roomId: string, isDm: boolean): Promise<void> {
    await this.windowService.focus();
    await this.router.navigate([isDm ? '/chat/room' : '/chat/rooms', roomId]);
  }

  /**
   * Titles the notification from the room it came from, and marks a mention so
   * the feedback names the chat the user was named in rather than reading as an
   * ordinary message.
   */
  private describe(message: MessageBroadcast, mentioned: boolean): { title: string; body: string; isDm: boolean } {
    const dm = this.conversations.dms().find(room => room.id === message.room_id);
    if (dm) {
      const peer = dm.other_name || dm.other_username;
      return {
        title: mentioned ? `Você foi mencionado em ${peer}` : peer,
        body: mentioned ? `${this.userService.displayName(message.author)}: ${message.content}` : message.content,
        isDm: true,
      };
    }

    this.ensureRoomNames();

    const roomName = this.roomNames()[message.room_id];
    const author = this.userService.displayName(message.author);
    // The `#` marks a public room, matching how the room list and the chat
    // header present it, so the feedback names the channel it came from.
    const roomLabel = roomName ? `#${roomName}` : author;

    return {
      title: mentioned ? `Você foi mencionado em ${roomLabel}` : roomLabel,
      body: roomName ? `${author}: ${message.content}` : message.content,
      isDm: false,
    };
  }

  /**
   * Resolves public room names once, on the first message that needs one. It is
   * deliberately not fetched at construction: the service is created before the
   * session is restored, and an unauthenticated request would 401 and sign the
   * user out through the interceptor.
   */
  private ensureRoomNames(): void {
    if (this.roomNamesLoaded) {
      return;
    }
    this.roomNamesLoaded = true;

    this.roomService.getPublicRooms().subscribe({
      next: rooms => {
        const names: Record<string, string> = {};
        for (const room of rooms) {
          names[room.id] = room.name;
        }
        this.roomNames.set(names);
      },
      error: () => undefined,
    });
  }

  private readBlocked(): ReadonlySet<string> {
    const raw = localStorage.getItem(BLOCKED_ROOMS_KEY);
    if (!raw) {
      return new Set();
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
    } catch {
      return new Set();
    }
  }
}
