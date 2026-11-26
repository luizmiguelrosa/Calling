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
  /**
   * Availability announced over the socket, keyed by user id. It is the live
   * counterpart of `onlineIds`: the directory list is a snapshot, while this is
   * pushed whenever a peer changes status or disconnects.
   */
  readonly statuses = signal<Record<string, PresenceStatus>>({});
  /** Live groups, used to resolve `@group:<name>` mentions and their colours. */
  readonly groups = signal<AdminGroupRef[]>([]);
  private loaded = false;
  private groupsLoaded = false;

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

  /** The group roster, fetched once for mention resolution and autocomplete. */
  loadGroupsOnce(): Observable<AdminGroupRef[]> {
    if (this.groupsLoaded) {
      return of(this.groups());
    }

    return this.api.get<AdminGroupRef[]>('/groups').pipe(
      tap(groups => {
        this.groups.set(groups);
        this.groupsLoaded = true;
      }),
    );
  }

  /** Resolves an `@group:<name>` token case-insensitively. */
  findGroup(name: string): AdminGroupRef | undefined {
    const target = name.toLowerCase();
    return this.groups().find(group => group.name.toLowerCase() === target);
  }

  /**
   * The directory users who belong to the named group. A user may hold several groups,
   * so this checks the whole set rather than a single label.
   */
  groupMembers(name: string): UserResponse[] {
    const target = name.toLowerCase();
    return this.users().filter(user =>
      user.groups.some(group => group.name.toLowerCase() === target),
    );
  }

  displayName(userId: string): string {
    const user = this.users().find(u => u.id === userId);
    return user?.name || user?.username || 'Usuário desconhecido';
  }

  getUserById(userId: string): UserResponse | undefined {
    return this.users().find(u => u.id === userId);
  }

  /**
   * Resolves a mention token to a user. Usernames are matched case-insensitively
   * because a mention is typed by hand and the directory is the authority on the
   * stored casing.
   */
  findByUsername(username: string): UserResponse | undefined {
    const target = username.toLowerCase();
    return this.users().find(u => u.username.toLowerCase() === target);
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

  /** Records a presence frame relayed over the socket. */
  setStatus(userId: string, status: PresenceStatus): void {
    this.statuses.update(current => ({ ...current, [userId]: status }));
  }

  /** Drops every announced status; the reconnect's snapshot repopulates them. */
  clearStatuses(): void {
    this.statuses.set({});
  }

  /** The announced status, or null when the user is offline or unknown. */
  statusOf(userId: string): UserStatus | null {
    const status = this.statuses()[userId];
    return status === 'online' || status === 'away' || status === 'dnd' ? status : null;
  }

  /**
   * The presence dot for a user: its class and label, or null when there is no
   * dot to show. The announced status wins; the online list is the fallback for
   * a user whose status has not arrived yet.
   */
  presence(userId: string): { class: string; label: string } | null {
    switch (this.statusOf(userId)) {
      case 'away':
        return { class: 'bg-away', label: 'Ausente' };
      case 'dnd':
        return { class: 'bg-destructive', label: 'Não perturbe' };
      case 'online':
        return { class: 'bg-online', label: 'Online' };
      default:
        return this.isOnline(userId) ? { class: 'bg-online', label: 'Online' } : null;
    }
  }
}