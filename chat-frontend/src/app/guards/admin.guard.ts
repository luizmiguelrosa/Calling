import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from '@/services/auth.service';
import { PermissionService } from '@/services/permission.service';

/**
 * The admin panel is reachable only with at least one admin capability. The
 * permission set is fetched before the decision, because a stored session says
 * nothing about what the role may do.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const permissions = inject(PermissionService);
  const router = inject(Router);

  if (!auth.isAuthenticated() || !auth.getCurrentUser()) {
    return router.createUrlTree(['/login']);
  }

  return permissions.loadOnce().pipe(
    map(() => (permissions.hasAdminAccess() ? true : router.createUrlTree(['/chat']))),
    catchError(() => of(router.createUrlTree(['/chat']))),
  );
};

/** Routes the bare `/admin` entry to the first category the role can open. */
export const adminHomeGuard: CanActivateFn = () => {
  const permissions = inject(PermissionService);
  const router = inject(Router);

  return permissions.loadOnce().pipe(
    map(() => router.createUrlTree([firstCategory(permissions)])),
    catchError(() => of(router.createUrlTree(['/chat']))),
  );
};

/**
 * Guards one admin category. `adminGuard` only proves the session may open the
 * panel at all, so without this a user holding one category could type the URL
 * of another and render its create/edit options even though the backend would
 * refuse every request. An unauthorized category redirects to `/admin`, which
 * lands on the first one the role may actually use.
 */
export function adminCategoryGuard(...required: string[]): CanActivateFn {
  return () => {
    const permissions = inject(PermissionService);
    const router = inject(Router);

    return permissions.loadOnce().pipe(
      map(() => (permissions.canAny(...required) ? true : router.createUrlTree(['/admin']))),
      catchError(() => of(router.createUrlTree(['/chat']))),
    );
  };
}

function firstCategory(permissions: PermissionService): string {
  if (permissions.can('users.manage')) {
    return '/admin/users';
  }
  if (permissions.can('roles.manage')) {
    return '/admin/roles';
  }
  if (permissions.canAny('rooms.view', 'rooms.edit', 'rooms.create')) {
    return '/admin/rooms';
  }
  return '/chat';
}