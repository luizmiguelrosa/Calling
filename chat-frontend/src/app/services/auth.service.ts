import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiConfigService } from './api-config.service';

/**
 * Holds the session in `localStorage` so a restart resumes the signed-in user
 * instead of bouncing back to the login screen. The cost is that storage is
 * shared by every window of an origin, so a second login in another window
 * replaces the first window's identity; the trade is deliberate, because losing
 * the session on every app restart is far more visible.
 *
 * The token is only trusted as a claim that a session *may* exist — the backend
 * is the authority. A 401 anywhere drops the stored pair through
 * `AuthInterceptor`, which is what turns an expired token into a redirect.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  private tokenKey = 'jwt_token';
  private userKey = 'jwt_user';

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.config.apiUrl()}/users/login`, {
      username,
      password,
    });
  }

  register(userData: CreateUserInput): Observable<UserResponse> {
    return this.http.post<UserResponse>(`${this.config.apiUrl()}/users`, userData);
  }

  /** Persists the signed-in identity alongside the token. */
  setSession(response: LoginResponse): void {
    this.setToken(response.token);

    if (response.user) {
      localStorage.setItem(this.userKey, JSON.stringify(response.user));
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
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