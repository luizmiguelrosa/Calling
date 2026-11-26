import { Injectable, inject, signal } from '@angular/core';

import { ApiConfigService } from './api-config.service';
import { AuthService } from './auth.service';

/** The Cache Storage bucket every downloaded image lives in. */
const CACHE_NAME = 'talk-images-v1';

/** Where the user's retention choice is persisted. */
const TTL_KEY = 'talk_cache_ttl_days';

/** The retention choices the settings offer, in days. */
export const CACHE_TTL_OPTIONS = [7, 15, 30] as const;

const DEFAULT_TTL_DAYS = 7;

/**
 * Soft ceiling the usage bar is drawn against. The cache is not hard-capped —
 * this only gives the progress bar a scale to fill.
 */
export const CACHE_SOFT_LIMIT_BYTES = 200 * 1024 * 1024;

/** Header stamped on a cached response so its age can be judged later. */
const CACHED_AT_HEADER = 'x-cached-at';

/**
 * How long a released object URL stays valid.
 *
 * Revoking it immediately races the view: an `<img>` still points at it until
 * the revision change re-renders, and the browser logs a failed load for the
 * dead URL. The delay lets the view swap the source before the URL disappears.
 */
const REVOKE_DELAY_MS = 1000;

/**
 * Keeps requested attachments in a local cache so a conversation does not
 * re-download the same picture or file on every visit.
 *
 * The store is the webview's Cache Storage, which is a real on-disk directory
 * managed by the runtime and works identically in a browser tab and inside the
 * Tauri shell. Each entry is stamped with the moment it was stored, so the
 * user's retention choice can expire it without a separate index.
 *
 * Attachments are fetched with the session token rather than through
 * `HttpClient`: the backend only serves a room file to a participant, and the
 * response is a blob the cache can hold, not a JSON body the interceptor would
 * try to parse.
 */
@Injectable({ providedIn: 'root' })
export class ImageCacheService {
  private readonly config = inject(ApiConfigService);
  private readonly auth = inject(AuthService);

  private readonly ttl = signal<number>(this.readTtl());
  /** The chosen retention, in days. */
  readonly ttlDays = this.ttl.asReadonly();

  private readonly usage = signal(0);
  /** Bytes currently held by the cache. */
  readonly usageBytes = this.usage.asReadonly();

  private readonly revisionSignal = signal(0);
  /**
   * Bumped whenever an entry is dropped, so a view showing a cached image can
   * re-resolve it instead of keeping a stale object URL.
   */
  readonly revision = this.revisionSignal.asReadonly();

  /** Object URLs handed out, keyed by the server path they belong to. */
  private readonly objectUrls = new Map<string, string>();

  setTtlDays(days: number): void {
    if (!CACHE_TTL_OPTIONS.includes(days as (typeof CACHE_TTL_OPTIONS)[number])) {
      return;
    }

    this.ttl.set(days);
    localStorage.setItem(TTL_KEY, String(days));
  }

  /**
   * Resolves a server-relative attachment path to an object URL, downloading
   * and caching it on a miss. Returns null when the file cannot be fetched, so
   * the caller can fall back to a placeholder.
   */
  async resolve(path: string): Promise<string | null> {
    const existing = this.objectUrls.get(path);
    if (existing) {
      return existing;
    }

    const blob = await this.read(path);
    if (!blob) {
      return null;
    }

    // A concurrent resolve for the same path may have landed while this one was
    // fetching; reuse its object URL instead of leaking a second one.
    const resolved = this.objectUrls.get(path);
    if (resolved) {
      return resolved;
    }

    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.set(path, objectUrl);
    return objectUrl;
  }

  /**
   * Returns the cached bytes for a path, downloading them on a miss. The save
   * flow needs the raw file rather than an object URL.
   *
   * A missing cache, an expired entry, a corrupt cached body, or a Cache
   * Storage failure all fall through to the server, so a damaged cache never
   * hides a file that is still available.
   */
  async read(path: string): Promise<Blob | null> {
    const url = `${this.config.apiUrl()}${path}`;
    const cache = await this.openCache();

    if (cache) {
      try {
        const cached = await cache.match(url);
        if (cached) {
          if (this.isExpired(cached)) {
            await cache.delete(url);
          } else {
            try {
              return await cached.blob();
            } catch {
              // A partial or corrupted entry must not mask the server copy.
              await cache.delete(url);
            }
          }
        }
      } catch {
        // `cache.match`/`delete` can reject (disabled storage, quota). Treat it
        // as a miss and try the server instead of failing the view.
      }
    }

    const fetched = await this.fetchAttachment(url);
    if (!fetched) {
      return null;
    }

    let blob: Blob;
    try {
      blob = await fetched.blob();
    } catch {
      return null;
    }

    if (cache) {
      try {
        await this.store(cache, url, blob, fetched.headers.get('Content-Type'));
      } catch {
        // The download succeeded; failing to persist it only costs a re-fetch.
      }
    }

    return blob;
  }

  /** Drops one cached attachment, so a replaced file is fetched again. */
  async invalidate(path: string): Promise<void> {
    this.releaseObjectUrl(path);

    const cache = await this.openCache();
    if (cache) {
      await cache.delete(`${this.config.apiUrl()}${path}`);
    }

    this.revisionSignal.update(value => value + 1);
  }

  /** Recomputes how much space the cache is using. */
  async refreshUsage(): Promise<void> {
    const cache = await this.openCache();
    if (!cache) {
      this.usage.set(0);
      return;
    }

    let total = 0;
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) {
        continue;
      }
      total += (await response.blob()).size;
    }

    this.usage.set(total);
  }

  /** Empties the cache and releases every object URL handed out. */
  async clear(): Promise<void> {
    this.releaseObjectUrls();

    if (typeof caches !== 'undefined') {
      await caches.delete(CACHE_NAME);
    }

    this.usage.set(0);
    this.revisionSignal.update(value => value + 1);
  }

  /** Removes every entry older than the current retention. */
  async cleanup(): Promise<void> {
    const cache = await this.openCache();
    if (!cache) {
      return;
    }

    let removed = false;
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response && this.isExpired(response)) {
        await cache.delete(request);
        removed = true;
      }
    }

    if (removed) {
      await this.refreshUsage();
    }
  }

  /**
   * Runs the cleanup in the background. Called from an app initializer, so it
   * deliberately does not return a promise: bootstrap must not wait on a sweep
   * of the cache.
   */
  scheduleCleanup(): void {
    void this.cleanup().catch(() => undefined);
  }

  /** Human-readable size, for the settings' usage label. */
  formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async openCache(): Promise<Cache | null> {
    if (typeof caches === 'undefined') {
      return null;
    }

    try {
      return await caches.open(CACHE_NAME);
    } catch {
      // Private modes and disabled storage can reject this; the app still works
      // without a cache, it just re-fetches every attachment.
      return null;
    }
  }

  /** Fetches an attachment with the session token; the backend only serves it to a participant. */
  private async fetchAttachment(url: string): Promise<Response | undefined> {
    const token = this.auth.getToken();

    try {
      const response = await fetch(url, {
        // The app keeps its own cache with a user-chosen TTL, so the HTTP cache is
        // bypassed. Left on, a replaced image would keep coming back from it until
        // its own max-age expired, and `invalidate` would look like it did nothing.
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      return response.ok ? response : undefined;
    } catch {
      // A dropped connection is reported as a miss; the caller renders its
      // placeholder instead of surfacing an unhandled rejection.
      return undefined;
    }
  }

  /**
   * Writes a fetched attachment into the cache, stamped with the moment it was
   * stored. A failure here is not fatal: the caller already has the blob and can
   * still display or save it.
   */
  private async store(cache: Cache, url: string, blob: Blob, contentType: string | null): Promise<void> {
    const stored = new Response(blob, {
      headers: {
        'Content-Type': contentType ?? 'application/octet-stream',
        [CACHED_AT_HEADER]: String(Date.now()),
      },
    });

    await cache.put(url, stored);
  }

  private isExpired(response: Response): boolean {
    const cachedAt = Number(response.headers.get(CACHED_AT_HEADER));
    if (!Number.isFinite(cachedAt) || cachedAt <= 0) {
      return true;
    }

    const ttlMs = this.ttl() * 24 * 60 * 60 * 1000;
    return Date.now() - cachedAt > ttlMs;
  }

  private releaseObjectUrl(path: string): void {
    const objectUrl = this.objectUrls.get(path);
    if (objectUrl) {
      this.objectUrls.delete(path);
      this.scheduleRevoke(objectUrl);
    }
  }

  private releaseObjectUrls(): void {
    for (const objectUrl of this.objectUrls.values()) {
      this.scheduleRevoke(objectUrl);
    }
    this.objectUrls.clear();
  }

  /**
   * Revokes a URL after the current frame, so a view that still renders it has
   * time to swap it for a freshly resolved one.
   */
  private scheduleRevoke(objectUrl: string): void {
    setTimeout(() => URL.revokeObjectURL(objectUrl), REVOKE_DELAY_MS);
  }

  private readTtl(): number {
    const stored = Number(localStorage.getItem(TTL_KEY));
    return CACHE_TTL_OPTIONS.includes(stored as (typeof CACHE_TTL_OPTIONS)[number])
      ? stored
      : DEFAULT_TTL_DAYS;
  }
}
