import { Injectable, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

/** The two startup behaviors the user can choose between. */
export type StartupMode = 'last' | 'home';

/** Where the app opens when the preference is "home", or when nothing is stored. */
const HOME_URL = '/chat/rooms';

/**
 * Remembers, per user, what the app should open on the next launch: the last
 * conversation the user had open, or the home screen.
 *
 * The preference is keyed by user id because the desktop client keeps one
 * `localStorage` per origin — without the id, two accounts on the same machine
 * would overwrite each other's choice. The last route is stored the same way, so
 * restoring it never leaks one user's conversation into another's session.
 */
@Injectable({ providedIn: 'root' })
export class StartupService {
  private readonly auth = inject(AuthService);

  private readonly modeSignal = signal<StartupMode>('home');
  readonly mode = this.modeSignal.asReadonly();

  /** Whether the preference has already shaped the startup entry this session. */
  private applied = false;

  /** Runs as an app initializer so the settings UI reads the stored choice. */
  init(): void {
    this.refresh();
  }

  setMode(mode: StartupMode): void {
    this.modeSignal.set(mode);

    const key = this.modeKey();
    if (key) {
      localStorage.setItem(key, mode);
    }
  }

  /** Re-reads the stored preference for the signed-in user. */
  refresh(): void {
    this.modeSignal.set(this.readMode());
  }

  /**
   * Records the route the user is on, so "open the last window" has something to
   * restore. Only chat routes are kept: the auth and server-address screens are
   * not conversations and must never be restored.
   */
  rememberRoute(url: string): void {
    if (!url.startsWith('/chat')) {
      return;
    }

    const key = this.lastRouteKey();
    if (key) {
      localStorage.setItem(key, url);
    }
  }

  /**
   * The URL the app should open on startup. Falls back to the home screen when
   * the preference is "home", when nothing was stored, or when the stored route
   * is not a restorable chat route.
   */
  resolveStartUrl(): string {
    this.refresh();

    if (this.modeSignal() !== 'last') {
      return HOME_URL;
    }

    const key = this.lastRouteKey();
    const last = key ? localStorage.getItem(key) : null;
    return last && last.startsWith('/chat') ? last : HOME_URL;
  }

  /**
   * The URL to open on the first navigation into the chat, or `null` once the
   * preference has already been applied.
   *
   * The guard consumes this rather than calling `resolveStartUrl` directly: the
   * guard runs on every navigation into the chat subtree, so without the
   * one-shot flag the preference would also hijack an in-app navigation to a
   * room. The flag makes it shape the startup entry alone.
   */
  resolveStartUrlOnce(): string | null {
    if (this.applied) {
      return null;
    }

    this.applied = true;
    return this.resolveStartUrl();
  }

  private readMode(): StartupMode {
    const key = this.modeKey();
    const stored = key ? localStorage.getItem(key) : null;
    return stored === 'last' ? 'last' : 'home';
  }

  private modeKey(): string | null {
    const userId = this.auth.getUserId();
    return userId ? `talk_startup_mode_${userId}` : null;
  }

  private lastRouteKey(): string | null {
    const userId = this.auth.getUserId();
    return userId ? `talk_last_route_${userId}` : null;
  }
}
