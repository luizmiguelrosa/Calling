import { Injectable, computed, signal } from '@angular/core';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { environment } from '../../environments/environment';

/** Where the active address came from, so the UI can explain it. */
export type ApiUrlSource = 'environment' | 'client' | 'default';

const STORAGE_KEY = 'calling_api_url';

/**
 * Resolves the backend address once, at startup, and every service reads it from
 * here instead of from `environment.apiUrl` directly.
 *
 * Precedence is deliberate: the process environment is an operator decision and
 * wins, because a packaged build should not be repointed by whatever the machine
 * happens to have in local storage. Only when the variable is absent does the
 * address the user typed on the login or register screen — persisted across
 * restarts — take over, with the compiled-in value as the last resort.
 */
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly url = signal(environment.apiUrl);
  private readonly origin = signal<ApiUrlSource>('default');

  /** The base address, without a trailing slash. */
  readonly apiUrl = this.url.asReadonly();
  readonly source = this.origin.asReadonly();

  /** A process-provided address is fixed; the user cannot retarget the build. */
  readonly locked = computed(() => this.origin() === 'environment');

  /**
   * True while nobody has chosen an address, so the client is silently aimed at
   * the compiled-in default. The auth screens use this to prompt for one instead
   * of letting the first request fail with a connection error.
   */
  readonly needsSetup = computed(() => this.origin() === 'default');

  async init(): Promise<void> {
    const fromProcess = await this.readProcessEnv();
    if (fromProcess) {
      this.apply(fromProcess, 'environment');
      return;
    }

    const stored = this.readStored();
    this.apply(stored ?? environment.apiUrl, stored ? 'client' : 'default');
  }

  /**
   * Persists a user-provided address. Ignored while the process environment
   * supplies one, so a locked build cannot be repointed from the client.
   */
  setApiUrl(value: string): void {
    if (this.locked()) {
      return;
    }

    const normalized = ApiConfigService.normalize(value);
    if (!normalized) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, normalized);
    this.apply(normalized, 'client');
  }

  /** Drops the saved address and falls back to the compiled-in default. */
  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.apply(environment.apiUrl, 'default');
  }

  /**
   * A bare host is the common case when typing an address, so a missing scheme
   * becomes `http://` rather than an error the user has to diagnose. A trailing
   * slash would produce `//path` once endpoints are appended.
   */
  static normalize(value: string): string | null {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return null;
    }

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

    try {
      const url = new URL(withScheme);
      return url.origin === 'null' ? null : url.origin;
    } catch {
      return null;
    }
  }

  /** `http(s)://host` becomes `ws(s)://host`, for the chat socket. */
  websocketBase(): string {
    return this.apiUrl().replace(/^http/, 'ws');
  }

  private apply(value: string, origin: ApiUrlSource): void {
    this.url.set(value);
    this.origin.set(origin);
  }

  private readStored(): string | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? ApiConfigService.normalize(raw) : null;
  }

  /** The webview has no access to the environment the app was started from. */
  private async readProcessEnv(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }

    try {
      const value = await invoke<string | null>('get_api_url');
      return value ? ApiConfigService.normalize(value) : null;
    } catch {
      return null;
    }
  }
}
