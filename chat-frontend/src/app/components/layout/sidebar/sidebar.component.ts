import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHouse, lucideMessageSquarePlus } from '@ng-icons/lucide';
import { filter, map } from 'rxjs';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardSidebarImports } from '@/shared/components/sidebar/sidebar.imports';
import { initials as toInitials } from '@/shared/utils/initials';

import { ConversationService } from '@/services/conversation.service';
import { UserService } from '@/services/user.service';

/**
 * Conversation rail, stacked in the same order as the icon rail it replaces:
 * new conversation on top, then the home entry, then the people list.
 * `zCollapsible="icon"` keeps it on a 3rem rail and expands it to
 * `--sidebar-width` on toggle, which is what the header menu button drives.
 */
@Component({
  selector: 'app-layout-sidebar',
  imports: [ZardSidebarImports, ZardAvatarComponent, NgIcon, RouterLink],
  // Explicit host box: without a definite height the panel's `h-full` resolves
  // against an auto-height ancestor and collapses to nothing.
  host: {
    class: 'block h-full shrink-0',
  },
  template: `
    <!-- relative/inset-y-auto/h-full put the panel in the row instead of pinning
         it to the viewport, because the app bar spans the full width above it.
         The important suffix beats the built-in unprefixed utilities.

         flex! is what keeps the rail alive below the md breakpoint: the panel
         ships hidden and only switches to flex at md, so without this the
         sidebar vanishes on any window narrower than 768px while the gap
         element keeps reserving its width, leaving a blank strip. The host
         display and height come from the rule in styles.css. -->
    <z-sidebar zCollapsible="icon" class="flex! relative! inset-y-auto! h-full! border-none!">
      <z-sidebar-content class="p-2">
        <div z-sidebar-group class="p-0">
          <ul z-sidebar-menu>
            <li z-sidebar-menu-item>
              <button z-sidebar-menu-button zType="outline" (click)="newConversation()">
                <ng-icon name="lucideMessageSquarePlus" />
                <span>Nova conversa</span>
              </button>
            </li>
          </ul>
        </div>

        <z-sidebar-separator class="mx-0" />

        <div z-sidebar-group class="p-0">
          <ul z-sidebar-menu>
            <li z-sidebar-menu-item>
              <a
                z-sidebar-menu-button
                [routerLink]="home.path"
                [zActive]="activeUrl().startsWith(home.path)"
                [zTooltip]="home.label"
              >
                <ng-icon [name]="home.icon" />
                <span>{{ home.label }}</span>
              </a>
            </li>
          </ul>
        </div>

        <z-sidebar-separator class="mx-0" />

        <div z-sidebar-group class="p-0">
          <div z-sidebar-group-label>Conversas anteriores</div>

          <div z-sidebar-group-content>
            <ul z-sidebar-menu>
              @for (dm of conversations.dms(); track dm.id) {
                <li z-sidebar-menu-item>
                  <a
                    z-sidebar-menu-button
                    class="h-10"
                    [routerLink]="['/chat/room', dm.id]"
                    [zActive]="activeUrl() === '/chat/room/' + dm.id"
                    [zTooltip]="dm.other_username"
                  >
                    <!-- A 24px avatar cannot fit the 16px content box the rail's
                         collapsed size-8/p-2 row leaves behind, so it drops to 16px there. -->
                    <!-- The presence dot pins to the avatar's corner instead of the row's
                         end: at the row end it reads as a row property, and it would
                         survive the collapse as a stray dot on the icon rail. -->
                    <span class="relative shrink-0">
                      <z-avatar
                        class="group-data-[collapsible=icon]:size-4!"
                        zSize="sm"
                        [zFallback]="initials(dm.other_name || dm.other_username)"
                      />
                      @if (isOnline(dm.other_user_id)) {
                        <span
                          class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-online ring-2 ring-background group-data-[collapsible=icon]:size-1.5"
                          role="img"
                          aria-label="Online"
                        ></span>
                      }
                    </span>
                    <span>{{ dm.other_username }}</span>
                  </a>
                </li>
              } @empty {
                <!-- The group label already folds away on the icon rail via its
                     variant; the empty state is a plain li, so it has to fold
                     itself or the text overflows the 3rem rail. -->
                <li
                  class="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
                >
                  {{ conversations.loading() ? 'Carregando...' : 'Nenhuma conversa' }}
                </li>
              }
            </ul>
          </div>
        </div>
      </z-sidebar-content>

      <button z-sidebar-rail></button>
    </z-sidebar>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHouse, lucideMessageSquarePlus })],
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly dialogService = inject(ZardDialogService);

  protected readonly conversations = inject(ConversationService);
  private readonly userService = inject(UserService);

  protected readonly home = { label: 'Início', path: '/chat/rooms', icon: 'lucideHouse' };

  /** Exposed for the template — an imported function is not in its scope. */
  protected readonly initials = toInitials;

  /**
   * `zActive` writes the `data-active` attribute the menu button's
   * `data-[active=true]:` variants read, so the router URL has to be tracked as
   * a signal — `routerLinkActive` only toggles classes, which those variants
   * cannot see.
   */
  protected readonly activeUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    this.conversations.refresh();
  }

  protected isOnline(userId: string): boolean {
    return this.userService.isOnline(userId);
  }

  /**
   * The picker is only reachable from this button, so it is imported on demand —
   * `zContent` needs the component type up front, which a `loadComponent` route
   * cannot give us.
   */
  protected async newConversation(): Promise<void> {
    const { NewConversationDialogComponent } = await import(
      '@/components/dialog/new-conversation/new-conversation-dialog.component'
    );

    this.dialogService.create({
      zTitle: 'Nova conversa',
      zContent: NewConversationDialogComponent,
      zHideFooter: true,
      zWidth: '26rem',
      // See the settings dialog: the vendored `sm:max-w-sm` cap would otherwise
      // win over `zWidth`.
      zCustomClasses: 'sm:max-w-md',
    });
  }
}
