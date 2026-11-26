import { Injectable, effect, inject, signal } from '@angular/core';

import { mentionsUser, findMentionTokens } from '@/shared/utils/mentions';

import { AuthService } from './auth.service';
import { ConversationService } from './conversation.service';
import { UserService } from './user.service';
import { WebSocketService } from './websocket.service';

/**
 * Owns the "was I mentioned?" question. It watches the app-scoped socket rather
 * than any one view, because a mention has to be recorded whether or not its
 * room is on screen — the same reason `NotificationService` watches the buffer.
 *
 * The count is the signal that always survives: `NotificationService` silences
 * the native feedback under Do Not Disturb or a muted room, but the mention
 * badge stays, so the room list keeps telling the truth about where the user was
 * named.
 */
@Injectable({ providedIn: 'root' })
export class MentionService {
  private readonly socket = inject(WebSocketService);
  private readonly authService = inject(AuthService);
  private readonly conversations = inject(ConversationService);
  private readonly userService = inject(UserService);

  /** Unread mention count per room id; a room absent from the map has none. */
  readonly unread = signal<Record<string, number>>({});

  /** How many entries of `socket.incoming()` have already been counted. */
  private processed = 0;

  /** The room on screen, so its mentions are read as they arrive. */
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
        if (!this.mentionsMe(message)) {
          continue;
        }

        // The room on screen is read as it arrives, so it never needs a badge —
        // the same rule the unread count follows.
        if (message.room_id === this.activeRoomId) {
          continue;
        }

        this.unread.update(counts => ({
          ...counts,
          [message.room_id]: (counts[message.room_id] ?? 0) + 1,
        }));
      }
    });
  }

  /**
   * Marks the room on screen, clearing its mentions. Called with `null` when the
   * view is torn down, so a room left behind is no longer treated as read.
   */
  setActiveRoom(roomId: string | null): void {
    this.activeRoomId = roomId;

    if (roomId) {
      this.markRead(roomId);
    }
  }

  /**
   * Whether the signed-in user is named by a message. Own messages never count,
   * and a mention is matched against the username — the token a sender types is
   * the username, not the display name. `@all` only counts in a public room: a
   * direct message has no audience for it. A group token counts when it names any
   * group the user belongs to, since a user may hold several.
   */
  mentionsMe(message: MessageBroadcast): boolean {
    const username = this.authService.getUsername();
    const userId = this.authService.getUserId();
    const groupNames = new Set(
      (this.authService.getCurrentUser()?.groups ?? []).map(group => group.name.toLowerCase()),
    );
    if (!username || message.author === userId) {
      return false;
    }

    const isDm = this.conversations.dms().some(dm => dm.id === message.room_id);
    if (mentionsUser(message.content, username, { allowAll: !isDm })) {
      return true;
    }

    // `@group:<name>` names everyone belonging to that group. The signed-in group set
    // comes from the session, so the directory is not needed to answer this.
    const groupPrefix = 'group:';
    for (const { token } of findMentionTokens(message.content)) {
      const lower = token.toLowerCase();
      if (lower.startsWith(groupPrefix) && groupNames.has(lower.slice(groupPrefix.length))) {
        return true;
      }
    }

    return false;
  }

  unreadFor(roomId: string): number {
    return this.unread()[roomId] ?? 0;
  }

  /** Clears a room's mentions; called when its conversation is opened. */
  private markRead(roomId: string): void {
    this.unread.update(counts => {
      if (!(roomId in counts)) {
        return counts;
      }

      const next = { ...counts };
      delete next[roomId];
      return next;
    });
  }
}