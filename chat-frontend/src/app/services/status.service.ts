import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { WebSocketService } from './websocket.service';

/**
 * The user's status, persisted so a restart keeps the choice — the same reason
 * the theme and backend address are stored. The value is also announced over the
 * chat socket, so other clients can colour the user's presence dot.
 */
@Injectable({ providedIn: 'root' })
export class StatusService {
  private static readonly STORAGE_KEY = 'calling_status';

  private readonly socket = inject(WebSocketService);

  private readonly current = signal<UserStatus>(this.read());

  readonly status = this.current.asReadonly();

  /** True while the user has chosen Do Not Disturb, which mutes notifications. */
  readonly isDnd = computed(() => this.current() === 'dnd');

  constructor() {
    // Announce the stored status as soon as the socket is up, so peers learn it
    // without waiting for the user to change it. `untracked` keeps a status
    // change from re-running this: `setStatus` already sends on its own.
    effect(() => {
      if (this.socket.connected()) {
        this.socket.sendStatus(untracked(() => this.current()));
      }
    });
  }

  setStatus(status: UserStatus): void {
    this.current.set(status);
    localStorage.setItem(StatusService.STORAGE_KEY, status);
    this.socket.sendStatus(status);
  }

  private read(): UserStatus {
    const stored = localStorage.getItem(StatusService.STORAGE_KEY);
    return stored === 'away' || stored === 'dnd' || stored === 'online' ? stored : 'online';
  }
}
