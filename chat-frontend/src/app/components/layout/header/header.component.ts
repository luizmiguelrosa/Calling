import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut, lucideMenu, lucideSettings } from '@ng-icons/lucide';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardPopoverImports } from '@/shared/components/popover/popover.imports';
import { ZardSidebarService } from '@/shared/components/sidebar/sidebar.service';
import { initials } from '@/shared/utils/initials';

import { SettingsDialogComponent } from '@/components/settings/settings-dialog/settings-dialog.component';

import { AuthService } from '@/services/auth.service';
import { WebSocketService } from '@/services/websocket.service';

/**
 * Full-width app bar: sidebar toggle and product identity on the left, the
 * signed-in account on the right. Must be rendered inside `z-sidebar-provider` —
 * the service that backs its toggle is provided there.
 */
@Component({
  selector: 'app-layout-header',
  imports: [NgIcon, ZardAvatarComponent, ZardButtonComponent, ...ZardPopoverImports],
  host: {
    class: 'block shrink-0',
  },
  template: `
    <header class="flex h-14 shrink-0 items-center gap-3 px-2">
      <button
        z-button
        zType="ghost"
        zSize="icon-sm"
        aria-label="Alternar barra lateral"
        (click)="toggleSidebar()"
      >
        <ng-icon name="lucideMenu" />
      </button>

      <p class="text-lg font-medium">Calling</p>

      <button
        zPopover
        [zContent]="accountMenu"
        zPlacement="bottom"
        zAlign="end"
        class="ml-auto flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Conta"
      >
        <z-avatar zSize="sm" [zFallback]="initials()" />
        <span class="max-w-40 truncate text-sm font-medium">{{ displayName() }}</span>
      </button>

      <ng-template #accountMenu>
        <z-popover class="w-56">
          <div z-popover-header>
            <span z-popover-title class="truncate">{{ displayName() }}</span>
            <span z-popover-description class="truncate">{{ username() }}</span>
          </div>

          <button z-button zType="ghost" class="w-full justify-start gap-2" (click)="openSettings()">
                      <ng-icon name="lucideSettings" />
                      Configurações
                    </button>

                    <button z-button zType="ghost" class="w-full justify-start gap-2" (click)="logout()">
            <ng-icon name="lucideLogOut" />
            Sair
          </button>
        </z-popover>
      </ng-template>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideMenu, lucideLogOut, lucideSettings })],
})
export class HeaderComponent {
  private readonly sidebar = inject(ZardSidebarService);
  private readonly authService = inject(AuthService);
  private readonly socket = inject(WebSocketService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly router = inject(Router);

  // Read once: the guard guarantees a session before this component is created,
  // and a reload is the only thing that changes the identity mid-session.
  private readonly user = signal<UserResponse | null>(this.authService.getCurrentUser());

  protected readonly displayName = computed(() => {
    const user = this.user();
    return user?.name || user?.username || 'Conta';
  });

  protected readonly username = computed(() => this.user()?.username ?? '');

  protected readonly initials = computed(() => initials(this.displayName()));

  protected toggleSidebar(): void {
    this.sidebar.toggleSidebar();
  }

  protected openSettings(): void {
      // The popover has to be gone before the dialog opens, or it stacks above it
      // and the click-outside handler of the dialog fires against the wrong layer.
      this.dialogService.create({
        zTitle: 'Configurações',
        zHideHeader: true,
        zHideFooter: true,
        zContent: SettingsDialogComponent,
        zWidth: '56rem',
        // The dialog ships a `sm:max-w-sm` cap that would hold it at 24rem no
        // matter what `zWidth` asks for; overriding the utility lets the width
        // through without editing the vendored component.
        zCustomClasses: 'sm:max-w-4xl',
      });
    }

    protected logout(): void {
    // The socket carries the identity, so it has to go down with the session;
    // otherwise it would keep receiving as the signed-out user.
    this.socket.disconnect();
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}