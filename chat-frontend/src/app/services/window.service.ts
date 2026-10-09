import { Injectable, signal } from '@angular/core';

import { isTauri } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

type WindowSize = { width: number; height: number };

/**
 * The auth screens are a centred form, so the window is pinned to one size and
 * refuses to be resized or maximized — a login form stretched across a 4K
 * display is not the same screen. The app takes the whole display instead.
 */
const AUTH_SIZE = { width: 480, height: 720 } satisfies WindowSize;

/**
 * Minimum dimensions for the app view to ensure the chat interface remains usable.
 */
const MIN_APP_SIZE = { width: 800, height: 600 } satisfies WindowSize;

type SizeMode = 'auth' | 'app';

@Injectable({ providedIn: 'root' })
export class WindowService {
  // `getCurrentWindow` is only meaningful inside the Tauri shell; in a plain
  // browser the IPC calls below would reject.
  private readonly appWindow = isTauri() ? getCurrentWindow() : null;
  private current: SizeMode | null = null;

  /** Drives the restore/maximize icon in the title bar. */
  readonly maximized = signal(false);

  readonly isMaximized = this.maximized.asReadonly();

  async applyRoute(url: string): Promise<void> {
    if (!this.appWindow) {
      return;
    }

    const mode: SizeMode = this.isAuthRoute(url) ? 'auth' : 'app';
    if (mode === this.current) {
      return;
    }
    this.current = mode;

    try {
      if (mode === 'app') {
        await this.applyAppSize();
      } else {
        await this.applyAuthSize();
      }
    } catch (err) {
      console.error('WindowService: could not resize the window', err);
    }
  }

  async minimize(): Promise<void> {
    await this.run(() => this.appWindow!.minimize());
  }

  async toggleMaximize(): Promise<void> {
    await this.run(async () => {
      const appWindow = this.appWindow!;
      await appWindow.toggleMaximize();

      // A maximized window has no meaningful position, so centering only applies
      // once it comes back to a normal size. Without this, restoring lands on
      // whatever geometry Windows last remembered, which can be off-screen.
      const maximized = await appWindow.isMaximized();
      this.maximized.set(maximized);

      if (!maximized) {
        // Restore the minimum size so the window cannot be shrunk below the
        // chat view's usable floor after coming back from maximized.
        await appWindow.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));
        await this.enforceMinFloor();
        await appWindow.center();
      }
    });
  }

  async close(): Promise<void> {
    await this.run(() => this.appWindow!.close());
  }

  private async applyAppSize(): Promise<void> {
    const appWindow = this.appWindow!;

    // The constraints have to be lifted before maximizing: a window pinned to a
    // 480px width cannot become maximized, and the call would be clamped instead.
    await appWindow.setMinSize(null);
    await appWindow.setMaxSize(null);
    await appWindow.setResizable(true);
    await appWindow.setMaximizable(true);

    // Set a floor so the chat view never shrinks to a size where the message
    // list and composer no longer share the window usefully.
    await appWindow.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));

    await appWindow.maximize();
    this.maximized.set(true);
  }

  /**
   * Runs before the first route is applied. A window that opens maximized has no
   * meaningful position, so there is nothing to center; the per-route handlers
   * take it from here.
   */
  async applyStartup(): Promise<void> {
    if (!this.appWindow) {
      return;
    }

    await this.run(async () => {
      const maximized = await this.appWindow!.isMaximized();
      this.maximized.set(maximized);

      if (!maximized) {
        await this.appWindow!.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));
        await this.appWindow!.center();
      }

      this.watchRestore();
    });
  }

  /**
   * Restoring can also come from the OS — Win+Down on Windows — which never
   * goes through `toggleMaximize`, so the min size would stay lifted and the
   * window could be shrunk below the chat's usable floor. The resize event is
   * the only signal that fires on that path; re-applying the constraints there
   * keeps every restore route covered.
   */
  private watchRestore(): void {
    void this.appWindow!.onResized(async () => {
      const maximized = await this.appWindow!.isMaximized();

      // Resize events also fire while dragging edges and while maximizing;
      // acting only on a state change keeps those from re-running the setup.
      if (maximized === this.maximized()) {
        return;
      }
      this.maximized.set(maximized);

      // In auth mode min and max are pinned to one size; touching the min here
      // would unpin the window.
      if (!maximized && this.current !== 'auth') {
        await this.appWindow!.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));

        // The OS restores to the geometry remembered before the maximize, which
        // can be the auth size — under the app floor. `setMinSize` only holds
        // future drags, so the applied size has to be corrected explicitly,
        // same as the in-app restore path does.
        await this.enforceMinFloor();
        await this.appWindow!.center();
      }
    });
  }

  private async applyAuthSize(): Promise<void> {
    const appWindow = this.appWindow!;
    const size = new LogicalSize(AUTH_SIZE.width, AUTH_SIZE.height);

    // Windows apply a restore asynchronously, so sizing the window immediately
    // after `unmaximize` loses the race and the OS puts the maximized geometry
    // back. Waiting for the resize to land first is what makes the size stick.
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
      await this.waitForResize();
    }

    // Pinning min and max to the same value is what actually holds the window at
    // one size. `resizable: false` only disables dragging the edge, which leaves
    // the OS free to restore whatever geometry it had before.
    await appWindow.setMinSize(size);
    await appWindow.setMaxSize(size);
    await appWindow.setResizable(false);
    await appWindow.setMaximizable(false);
    await appWindow.setSize(size);
    await appWindow.center();

    this.maximized.set(false);
  }

  /**
   * Grows the window back to the app floor when its current size sits under
   * it. `setMinSize` only constrains future interactive resizes — it never
   * corrects the geometry the OS just applied, which is what a restore from
   * maximized does on Windows.
   */
  private async enforceMinFloor(): Promise<void> {
    const appWindow = this.appWindow!;

    // `innerSize` is physical, while the floor is logical; the scale factor
    // converts between them.
    const scale = await appWindow.scaleFactor();
    const size = await appWindow.innerSize();
    const width = size.width / scale;
    const height = size.height / scale;

    if (width < MIN_APP_SIZE.width || height < MIN_APP_SIZE.height) {
      await appWindow.setSize(
        new LogicalSize(
          Math.max(width, MIN_APP_SIZE.width),
          Math.max(height, MIN_APP_SIZE.height),
        ),
      );
    }
  }

  /** Resolves on the window's next resize event, or after a short fallback. */
  private waitForResize(): Promise<void> {
    const appWindow = this.appWindow!;

    return new Promise(resolve => {
      const timer = setTimeout(finish, 150);

      function finish(): void {
        clearTimeout(timer);
        void unlisten?.();
        resolve();
      }

      let unlisten: (() => void) | undefined;

      void appWindow.onResized(() => finish()).then(fn => {
        unlisten = fn;
      });
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (!this.appWindow) {
      return;
    }

    try {
      await action();
    } catch (err) {
      console.error('WindowService: window command failed', err);
    }
  }

  private isAuthRoute(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return path === '/' || path === '/login' || path === '/register' || path === '/settings/server';
  }
}