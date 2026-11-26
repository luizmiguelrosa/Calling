import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap, map } from 'rxjs';

import { ApiService } from './api.service';

/**
 * The general permissions the signed-in user holds, resolved once from
 * `GET /me/permissions`. A role holding `admin.all` is treated as holding every
 * key, which is why the wildcard is checked here rather than duplicated in every
 * caller.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly api = inject(ApiService);

  readonly permissions = signal<ReadonlySet<string>>(new Set());

  private loaded = false;

  /** Emits the cached set, fetching it only on the first call. */
  loadOnce(): Observable<string[]> {
    if (this.loaded) {
      return of([...this.permissions()]);
    }

    return this.api.get<MyPermissions>('/me/permissions').pipe(
      map(response => response.permissions ?? []),
      tap(list => {
        this.permissions.set(new Set(list));
        this.loaded = true;
      }),
    );
  }

  can(permission: string): boolean {
    const granted = this.permissions();
    return granted.has('admin.all') || granted.has(permission);
  }

  /** True while the user holds at least one of the given keys. */
  canAny(...permissions: string[]): boolean {
    return permissions.some(permission => this.can(permission));
  }

  /** Whether any admin category is reachable, so the admin entry can be shown. */
  readonly hasAdminAccess = computed(
    () =>
      this.canAny(
        'users.manage',
        'roles.manage',
        'groups.manage',
        'rooms.view',
        'rooms.edit',
        'rooms.create',
      ),
  );

  /** A fresh session may belong to another user, so the set is dropped. */
  reset(): void {
    this.permissions.set(new Set());
    this.loaded = false;
  }
}