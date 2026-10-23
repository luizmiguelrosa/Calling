import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideLogOut, lucideMenu, lucideSettings } from '@ng-icons/lucide';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardPopoverImports } from '@/shared/components/popover/popover.imports';
import { ZardSeparatorComponent } from '@/shared/components/separator';
import { ZardSidebarService } from '@/shared/components/sidebar/sidebar.service';
import { initials } from '@/shared/utils/initials';

import { SettingsDialogComponent } from '@/components/settings/settings-dialog/settings-dialog.component';
import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

import { AuthService } from '@/services/auth.service';
import { StatusService } from '@/services/status.service';
import { WebSocketService } from '@/services/websocket.service';

/**
 * Full-width app bar: sidebar toggle and product identity on the left, the
 * signed-in account on the right. Must be rendered inside `z-sidebar-provider` —
 * the service that backs its toggle is provided there.
 */
@Component({
  selector: 'app-layout-header',
  imports: [NgIcon, ZardAvatarComponent, ZardButtonComponent, ZardSeparatorComponent, UserAvatarComponent, ...ZardPopoverImports],
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

      <!-- The service reconnects on its own, so the pill is a status, not an
           action: it disappears the moment a reconnect succeeds. -->
      @if (connectionState() === 'lost') {
        <span
          class="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"
          role="status"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-destructive"></span>
          Sem conexão — reconectando...
        </span>
      } @else if (connectionState() === 'connecting') {
        <span
          class="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          role="status"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-muted-foreground"></span>
          Conectando...
        </span>
      }

      <button
        zPopover
        [zContent]="accountMenu"
        zPlacement="bottom"
        zAlign="end"
        class="ml-auto flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Conta"
      >
        <!-- The status dot pins to the avatar's corner so it reads as a property
             of the person, not of the row. -->
        <span class="relative shrink-0">
          @if (user(); as account) {
            <app-user-avatar [userId]="account.id" [name]="account.name" [username]="account.username" />
          } @else {
            <z-avatar zSize="sm" [zFallback]="initials()" />
          }
          <span
            class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background"
            [class]="statusDotClass()"
            role="img"
            [attr.aria-label]="statusLabel()"
          ></span>
        </span>
        <span class="max-w-40 truncate text-sm font-medium">{{ displayName() }}</span>
      </button>

      <ng-template #accountMenu>
        <z-popover class="w-56">
          <div z-popover-header>
            <span z-popover-title class="truncate">{{ displayName() }}</span>
            <span z-popover-description class="truncate">{{ username() }}</span>
          </div>

          <div class="flex flex-col gap-0.5">
            <span class="px-2 text-xs font-medium text-muted-foreground">Status</span>

            @for (option of statusOptions; track option.value) {
              <button
                z-button
                zType="ghost"
                class="w-full justify-start gap-2"
                (click)="setStatus(option.value)"
              >
                <span class="size-2 shrink-0 rounded-full" [class]="option.dotClass"></span>
                <span class="truncate">{{ option.label }}</span>
                @if (statusService.status() === option.value) {
                  <ng-icon name="lucideCheck" class="ml-auto" />
                }
              </button>
            }
          </div>

          <z-separator />

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
  viewProviders: [provideIcons({ lucideMenu, lucideLogOut, lucideSettings, lucideCheck })],
})
export class HeaderComponent {
  private readonly sidebar = inject(ZardSidebarService);
  private readonly authService = inject(AuthService);
  private readonly socket = inject(WebSocketService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly router = inject(Router);

  protected readonly statusService = inject(StatusService);

  /** The three availability states offered by the account menu. */
  protected readonly statusOptions: readonly { value: UserStatus; label: string; dotClass: string }[] = [
    { value: 'online', label: 'Online', dotClass: 'bg-online' },
    { value: 'away', label: 'Ausente', dotClass: 'bg-away' },
    { value: 'dnd', label: 'Não perturbe', dotClass: 'bg-destructive' },
  ];

  // Read once: the guard guarantees a session before this component is created,
  // and a reload is the only thing that changes the identity mid-session.
  protected readonly user = signal<UserResponse | null>(this.authService.getCurrentUser());

  protected readonly displayName = computed(() => {
    const user = this.user();
    return user?.name || user?.username || 'Conta';
  });

  protected readonly username = computed(() => this.user()?.username ?? '');

  protected readonly initials = computed(() => initials(this.displayName()));

  /** The colour of the dot on the avatar, matching the current status. */
  protected readonly statusDotClass = computed(
    () => this.statusOptions.find(option => option.value === this.statusService.status())?.dotClass ?? 'bg-online',
  );

  protected readonly statusLabel = computed(
    () => this.statusOptions.find(option => option.value === this.statusService.status())?.label ?? 'Online',
  );

  /**
   * `connected` alone cannot tell "the server just went away" from "the first
   * handshake has not finished yet", so the loss message only shows once a
   * connection has actually existed.
   */
  protected readonly connectionState = computed<'connected' | 'lost' | 'connecting'>(() => {
    if (this.socket.connected()) {
      return 'connected';
    }
    return this.socket.everConnected() ? 'lost' : 'connecting';
  });

  protected toggleSidebar(): void {
    this.sidebar.toggleSidebar();
  }

  protected setStatus(status: UserStatus): void {
    this.statusService.setStatus(status);
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