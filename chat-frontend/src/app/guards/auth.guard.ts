import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@/services/auth.service';

/**
 * Both halves of the session are required. A token without the stored user (or
 * the reverse) means a half-finished login, and letting it through would render
 * the shell with no identity to show. The partial state is cleared on the way
 * out so a retry starts clean.
 *
 * A stored token is only a claim that a session *may* exist — it is not proof.
 * An expired or stale token passes here and is rejected by the first request,
 * where `authInterceptor` clears it and sends the app back to login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.getCurrentUser()) {
    return true;
  }

  auth.clearToken();
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/**
 * Keeps a signed-in user off the login and register screens, which would
 * otherwise let them re-authenticate and overwrite the stored identity.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.getCurrentUser()) {
    return router.createUrlTree(['/chat']);
  }

  return true;
};
