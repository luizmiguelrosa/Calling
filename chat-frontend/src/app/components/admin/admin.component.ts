import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideHash,
  lucideKeyRound,
  lucideShield,
  lucideUsers,
  lucideGroup,
} from '@ng-icons/lucide';

import { AuthService } from '@/services/auth.service';
import { PermissionService } from '@/services/permission.service';

interface AdminCategory {
  path: string;
  label: string;
  icon: string;
  visible: boolean;
}

/**
 * The admin shell: categories on the left, the selected category on the right.
 * A category is only rendered when the role holds the permission behind it, so
 * a role manager never sees a users table it would be refused.
 */
@Component({
  selector: 'admin-shell',
  standalone: true,
  imports: [NgIcon, RouterLink, RouterLinkActive, RouterOutlet],
  host: {
    class: 'block h-full w-full overflow-hidden bg-canvas',
  },
  template: `
    <div class="flex h-full flex-col">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b bg-canvas px-3">
        <a
          routerLink="/chat"
          class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Voltar para o chat"
          title="Voltar para o chat"
        >
          <ng-icon name="lucideArrowLeft" />
        </a>

        <h1 class="text-lg font-medium">Administração</h1>

        <span class="ml-auto truncate text-sm text-muted-foreground">{{ accountName() }}</span>
      </header>

      <div class="flex min-h-0 flex-1">
        <nav class="w-60 shrink-0 border-r bg-canvas p-2" aria-label="Categorias da administração">
          <ul class="flex flex-col gap-0.5">
            @for (category of categories(); track category.path) {
              @if (category.visible) {
                <li>
                  <a
                    [routerLink]="category.path"
                    routerLinkActive="bg-accent text-accent-foreground"
                    class="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <ng-icon [name]="category.icon" class="size-4 shrink-0" />
                    <span class="truncate">{{ category.label }}</span>
                  </a>
                </li>
              }
            }
          </ul>
        </nav>

        <main class="min-w-0 flex-1 overflow-auto p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({ lucideArrowLeft, lucideUsers, lucideShield, lucideHash, lucideKeyRound, lucideGroup }),
  ],
})
export class AdminComponent {
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);

  protected readonly accountName = computed(() => {
    const user = this.authService.getCurrentUser();
    return user?.name || user?.username || '';
  });

  protected readonly categories = computed<AdminCategory[]>(() => [
    {
      path: '/admin/users',
      label: 'Usuários',
      icon: 'lucideUsers',
      visible: this.permissionService.can('users.manage'),
    },
    {
      path: '/admin/roles',
      label: 'Cargos',
      icon: 'lucideShield',
      visible: this.permissionService.can('roles.manage'),
    },
    {
      path: '/admin/groups',
      label: 'Grupos',
      icon: 'lucideGroup',
      visible: this.permissionService.can('groups.manage'),
    },
    {
      path: '/admin/rooms',
      label: 'Salas',
      icon: 'lucideHash',
      visible: this.permissionService.canAny('rooms.view', 'rooms.edit', 'rooms.create'),
    },
    {
      path: '/admin/permissions',
      label: 'Permissões',
      icon: 'lucideKeyRound',
      visible: this.permissionService.can('roles.manage'),
    },
  ]);
}