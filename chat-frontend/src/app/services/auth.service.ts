import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, finalize, shareReplay, tap, throwError } from 'rxjs';

import { ApiConfigService } from './api-config.service';

/**
 * Holds the session in `localStorage` so a restart resumes the signed-in user
 * instead of bouncing back to the login screen. The cost is that storage is
 * shared by every window of an origin, so a second login in another window
 * replaces the first window's identity; the trade is deliberate, because losing
 * the session on every app restart is far more visible.
 *
 * The session is a pair: a short-lived access token that authenticates requests
 * and a long-lived refresh token that mints a new pair once the access token
 * expires. The tokens are only trusted as a claim that a session *may* exist —
 * the backend is the authority. A 401 that cannot be recovered by refreshing
 * drops the pair through `AuthInterceptor`, which is what turns a dead session
 * into a redirect.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  private tokenKey = 'jwt_token';
  private refreshTokenKey = 'jwt_refresh_token';
  private userKey = 'jwt_user';

  /**
   * Shared in-flight refresh. Several requests can fail with 401 at once (a
   * room change fires history, rooms, and presence together), and each must wait
   * on the same rotation instead of racing to spend the same refresh token.
   */
  private refreshInFlight: Observable<TokenPair> | null = null;

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.config.apiUrl()}/users/login`, {
      username,
      password,
    });
  }

  register(userData: CreateUserInput): Observable<UserResponse> {
    return this.http.post<UserResponse>(`${this.config.apiUrl()}/users`, userData);
  }

  /**
   * Exchanges the stored refresh token for a fresh pair. The backend rotates the
   * refresh token on every use, so the stored pair is replaced on success.
   */
  refresh(): Observable<TokenPair> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('no refresh token'));
    }

    this.refreshInFlight = this.http
      .post<TokenPair>(`${this.config.apiUrl()}/users/refresh`, { refresh_token: refreshToken })
      .pipe(
        tap(pair => this.setTokens(pair)),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1),
      );

    return this.refreshInFlight;
  }

  /** Persists the signed-in identity alongside the token pair. */
  setSession(response: LoginResponse): void {
    this.setTokens(response);

    if (response.user) {
      localStorage.setItem(this.userKey, JSON.stringify(response.user));
    }
  }

  setTokens(pair: TokenPair): void {
    localStorage.setItem(this.tokenKey, pair.accessToken);
    localStorage.setItem(this.refreshTokenKey, pair.refreshToken);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  getCurrentUser(): UserResponse | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as UserResponse;
    } catch {
      return null;
    }
  }

  getUserId(): string | null {
    return this.getCurrentUser()?.id ?? null;
  }

  getUsername(): string | null {
    return this.getCurrentUser()?.username ?? null;
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
  }

  /**
   * Semantic entry point for signing out. Navigation stays with the caller; this
   * is also where a WebSocket teardown belongs once one is connected.
   */
  logout(): void {
    this.clearToken();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : '',
    });
  }
}
