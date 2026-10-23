import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '@/services/auth.service';
import { WebSocketService } from '@/services/websocket.service';

/**
 * A 401 means the stored access token is no longer good — expired, signed with
 * another secret, or pointing at a different backend after the address changed.
 * Before giving up, the interceptor spends the refresh token once to obtain a
 * new pair and replays the original request with the fresh access token, so an
 * expired access token is invisible to the user. Only when the refresh itself
 * fails is the session dropped and the app sent back to login.
 *
 * The login, register, and refresh calls are excluded: a wrong password is a 401
 * too, and refreshing the refresh call would recurse.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const socket = inject(WebSocketService);
  const router = inject(Router);

  const isAuthEntryPoint =
    req.url.endsWith('/users/login') ||
    req.url.endsWith('/users') ||
    req.url.endsWith('/users/refresh');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthEntryPoint) {
        return throwError(() => error);
      }

      // Replaying through `next` does not re-enter this interceptor, so a second
      // 401 is terminal rather than a loop.
      return auth.refresh().pipe(
        switchMap(pair =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${pair.accessToken}` } })),
        ),
        catchError(() => {
          auth.clearToken();
          socket.disconnect();
          void router.navigate(['/login']);
          return throwError(() => error);
        }),
      );
    }),
  );
};
