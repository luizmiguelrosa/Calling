import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { StartupService } from '@/services/startup.service';

/**
 * Applies the user's startup preference to the first navigation into the chat.
 *
 * It cannot key off the URL: Angular resolves `redirectTo` during recognition,
 * before guards run, so the `/chat` child redirect (`'' → 'rooms'`) means the
 * guard already sees `/chat/rooms` rather than `/chat`. Instead the service
 * hands out the target exactly once (`resolveStartUrlOnce`), so the preference
 * shapes the startup entry alone — a later in-app navigation to a room is left
 * untouched and does not bounce back to the startup target.
 */
export const startupGuard: CanActivateFn = (_route, state) => {
  const startup = inject(StartupService);
  const router = inject(Router);

  const url = startup.resolveStartUrlOnce();
  if (!url || url === state.url) {
    return true;
  }

  return router.parseUrl(url);
};
