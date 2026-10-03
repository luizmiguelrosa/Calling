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