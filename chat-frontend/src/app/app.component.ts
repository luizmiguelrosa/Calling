import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { isTauri } from '@tauri-apps/api/core';
import { filter } from 'rxjs';

import { StartupLoadingComponent } from './components/layout/startup-loading/startup-loading.component';
import { TitleBarComponent } from './components/layout/titlebar/titlebar.component';
import { AuthService } from './services/auth.service';
import { StartupService } from './services/startup.service';
import { UserService } from './services/user.service';
import { WebSocketService } from './services/websocket.service';
import { WindowService } from './services/window.service';

/**
 * How long the splash waits for the first socket handshake before releasing the
 * app anyway. A backend that never answers must not hold the whole window behind
 * a spinner — the header's own connection pill takes over from there.
 */
const STARTUP_CONNECT_TIMEOUT_MS = 4000;

/**
 * The title bar sits above the routed view so every window gets it: the app
 * drops its native decorations, so nothing else would let the window be moved.
 * The outlet below keeps the full remaining height rather than the viewport,
 * which is what the chat shell's `h-full` chain resolves against.
 */
@Component({
  selector: "app-root",
  imports: [RouterOutlet, StartupLoadingComponent, TitleBarComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  // The root's own layout lives in `app.component.css` rather than here: a
  // `host` class cannot win against the encapsulated `:host` rule without
  // resorting to `!important`, and it silently did not.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly windowService = inject(WindowService);
  private readonly authService = inject(AuthService);
  private readonly socket = inject(WebSocketService);
  private readonly userService = inject(UserService);
  private readonly startup = inject(StartupService);

  /**
   * The native title bar is disabled in `tauri.conf.json`, so the custom one is
   * what makes the window movable. In a plain browser there is no window to
   * control, and showing dead buttons would only be misleading.
   */
  protected readonly showTitleBar = isTauri();

  /**
   * True until the first route has settled and, for a restored session, the
   * socket has connected. The splash covers the address resolution that runs
   * before bootstrap and the first handshake, so the chat never flashes empty.
   */
  protected readonly booting = signal(true);

  constructor() {
    // Center before the first navigation settles. The auth route would center
    // anyway, but a session restored straight into the chat maximizes, and the
    // window should not sit wherever the OS placed it during that handoff.
    void this.windowService.applyStartup();

    const release = () => this.booting.set(false);
    const timeout = setTimeout(release, STARTUP_CONNECT_TIMEOUT_MS);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(event => {
        void this.windowService.applyRoute(event.urlAfterRedirects);

        // The socket is app-scoped, not per route, so it is opened once here for
        // a session restored from storage. Logging in opens it too.
        if (this.authService.isAuthenticated()) {
          this.startup.rememberRoute(event.urlAfterRedirects);
          this.socket.connect();
          this.userService.loadOnline();
        } else {
          // No session means no handshake to wait for; the auth screen is ready.
          clearTimeout(timeout);
          release();
        }
      });

    // A restored session releases the splash the moment the handshake lands.
    effect(() => {
      if (this.socket.connected()) {
        clearTimeout(timeout);
        release();
      }
    });
  }
}
