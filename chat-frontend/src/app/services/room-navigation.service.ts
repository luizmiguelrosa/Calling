import { Injectable, signal } from '@angular/core';

/**
 * Remembers the last public room the user opened, so the sidebar's "Início"
 * entry can return to it instead of dropping back to the bare room list.
 *
 * Persisted because a desktop app that forgets where you were on every launch
 * reads as broken — the same reason the theme and backend address are stored.
 * Only public rooms are recorded: the DM route is a different path, so a DM can
 * never become the target.
 */
@Injectable({ providedIn: 'root' })
export class RoomNavigationService {
  private static readonly STORAGE_KEY = 'calling_last_room';

  private readonly lastRoom = signal<string | null>(
    localStorage.getItem(RoomNavigationService.STORAGE_KEY),
  );

  readonly lastRoomId = this.lastRoom.asReadonly();

  remember(roomId: string): void {
    this.lastRoom.set(roomId);
    localStorage.setItem(RoomNavigationService.STORAGE_KEY, roomId);
  }
}
