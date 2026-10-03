import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '@/services/auth.service';
import { WebSocketService } from '@/services/websocket.service';

/**
 * A 401 means the stored token is no longer good — expired, signed with another
 * secret, or pointing at a different backend after the address changed. The
 * session is dropped and the app is sent back to login from one place, so no
 * view has to remember to check status codes.
 *
 * The login and register calls are excluded: a wrong password is a 401 too, and
 * clearing the session there would turn a failed attempt into a redirect loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const socket = inject(WebSocketService);
  const router = inject(Router);

  const isAuthEntryPoint = req.url.endsWith('/users/login') || req.url.endsWith('/users');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEntryPoint) {
        auth.clearToken();
        socket.disconnect();
        void router.navigate(['/login']);
      }

      return throwError(() => error);
    }),
  );
};
