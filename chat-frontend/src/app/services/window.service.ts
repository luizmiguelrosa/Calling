import { Injectable, signal } from '@angular/core';

import { isTauri } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { UserAttentionType, getCurrentWindow } from '@tauri-apps/api/window';

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
      const wasMaximized = await appWindow.isMaximized();

      // tao's `setMinSize` re-applies the window's current inner size, and doing
      // that while maximized clears the maximized flag and drops the window back
      // to a full-size, non-maximized state. The floor is therefore only applied
      // while the window is restored: before maximizing, and again after
      // restoring — never while it is maximized.
      if (!wasMaximized) {
        await appWindow.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));
      }

      await appWindow.toggleMaximize();

      // A maximized window has no meaningful position, so centering only applies
      // once it comes back to a normal size. Without this, restoring lands on
      // whatever geometry Windows last remembered, which can be off-screen.
      const maximized = await appWindow.isMaximized();
      this.maximized.set(maximized);

      if (!maximized) {
        await appWindow.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));
        await this.enforceMinFloor();
        await appWindow.center();
      }
    });
  }

  async close(): Promise<void> {
    await this.run(() => this.appWindow!.close());
  }

  /**
   * Brings the window back in front, restoring it first when it is minimized.
   * Used when the user acts on a native notification, which is the only way to
   * reach the app while it is out of sight.
   */
  async focus(): Promise<void> {
    await this.run(async () => {
      const appWindow = this.appWindow!;

      if (await appWindow.isMinimized()) {
        await appWindow.unminimize();
      }

      await appWindow.setFocus();
    });
  }

  /**
   * Flashes the taskbar button so a message that arrived while the window was
   * in the background is noticed. `Critical` is what produces the native yellow
   * blink on Windows; it keeps flashing until the window is focused, which is
   * the point — the user is being asked to come back.
   */
  async requestAttention(): Promise<void> {
    await this.run(async () => {
      const appWindow = this.appWindow!;

      // A focused, visible window is left alone: the message is already on
      // screen, and a blink would only be noise. A minimized window is checked
      // explicitly: it must still flash even if the OS reports it as focused,
      // which is what made the blink appear only while the app was open.
      if ((await appWindow.isFocused()) && !(await appWindow.isMinimized())) {
        return;
      }

      await appWindow.requestUserAttention(UserAttentionType.Critical);
    });
  }

  private async applyAppSize(): Promise<void> {
    const appWindow = this.appWindow!;

    // The constraints have to be lifted before maximizing: a window pinned to a
    // 480px width cannot become maximized, and the call would be clamped instead.
    await appWindow.setMinSize(null);
    await appWindow.setMaxSize(null);
    await appWindow.setResizable(true);
    await appWindow.setMaximizable(true);

    // The floor is deliberately not set here. tao's `setMinSize` re-applies the
    // window's current inner size, so calling it while maximized clears the
    // maximized flag and drops the window back to a full-size, non-maximized
    // state — and pins the restored size to that full size, so restoring can
    // never shrink it again. The floor is applied by the restore paths instead
    // (`toggleMaximize` and `watchResize`), which only run while the window is
    // restored.
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

      // Only center here. The app floor is left to `applyRoute`, which knows the
      // mode: setting the 800x600 floor while the window is still at the 480x720
      // auth size grows it, and the route handler then resizes it again — a
      // visible jump on every launch.
      if (!maximized) {
        await this.appWindow!.center();
      }

      this.watchResize();
    });
  }

  /**
   * The OS can resize the window without going through the app's own controls —
   * Win+Down, dragging the title bar out of maximized, or a snap. `setMinSize`
   * only constrains future interactive drags; it never corrects a geometry the OS
   * has already applied, and a restore from maximized lands on the size Windows
   * remembered before maximizing, which can be the 480x720 auth size and therefore
   * under the app floor. Every resize is therefore checked and corrected, whatever
   * triggered it.
   */
  private watchResize(): void {
    void this.appWindow!.onResized(async () => {
      // Before the first route is applied there is no mode to size against and
      // the startup handoff is still settling; enforcing the floor here would
      // grow the window only to have it resized again.
      if (this.current === null) {
        return;
      }

      const maximized = await this.appWindow!.isMaximized();
      const restored = maximized !== this.maximized();
      this.maximized.set(maximized);

      // In auth mode min and max are pinned to one size; touching the min here
      // would unpin the window. A maximized window has no floor to enforce.
      if (this.current === 'auth' || maximized) {
        return;
      }

      await this.appWindow!.setMinSize(new LogicalSize(MIN_APP_SIZE.width, MIN_APP_SIZE.height));
      await this.enforceMinFloor();

      // Re-centering only makes sense when the window came back from maximized;
      // doing it on every resize would fight the user while they drag.
      if (restored) {
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