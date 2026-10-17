import { ChangeDetectionStrategy, Component } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';

/**
 * Full-screen splash shown while the app is still reaching the backend — the
 * address resolution during bootstrap and, when a session is restored, the first
 * WebSocket handshake. It covers the whole window so the chat shell never
 * flashes empty before the connection settles.
 */
@Component({
  selector: 'app-startup-loading',
  imports: [NgIcon],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
      <ng-icon name="lucideLoaderCircle" class="size-8 animate-spin text-muted-foreground" />
      <p class="text-sm text-muted-foreground">Conectando ao servidor...</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideLoaderCircle })],
})
export class StartupLoadingComponent {}
