import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

import { ApiService } from './api.service';

/**
 * The user directory. Cached because several views need it to turn the user IDs
 * that history and rooms carry into something readable.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  readonly users = signal<UserResponse[]>([]);
  /** User IDs with a live WebSocket, per GET /users/online. */
  readonly onlineIds = signal<ReadonlySet<string>>(new Set());
  private loaded = false;

  getUsers(): Observable<UserResponse[]> {
    return this.api.get<UserResponse[]>('/users').pipe(
      tap(users => {
        this.users.set(users);
        this.loaded = true;
      }),
    );
  }

  /** Emits the cached directory, fetching it only on the first call. */
  loadOnce(): Observable<UserResponse[]> {
    return this.loaded ? of(this.users()) : this.getUsers();
  }

  displayName(userId: string): string {
    const user = this.users().find(u => u.id === userId);
    return user?.name || user?.username || userId;
  }

  /**
   * Presence is a snapshot of who happens to be connected right now, so it goes
   * stale on its own — refresh it when the view that shows it is opened.
   */
  loadOnline(): void {
    this.api.get<string[]>('/users/online').subscribe({
      next: ids => this.onlineIds.set(new Set(ids)),
      error: () => undefined,
    });
  }

  isOnline(userId: string): boolean {
    return this.onlineIds().has(userId);
  }
}