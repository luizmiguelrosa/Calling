import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';

import { provideIcons } from '@ng-icons/core';
import { lucideUsers } from '@ng-icons/lucide';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardTableImports } from '@/shared/components/table';

import { AdminConfirmService } from '@/components/admin/shared/admin-confirm.service';

import { AdminService } from '@/services/admin.service';

import type { UserAdminDialogData } from './user-admin-dialog.component';

/**
 * Users category: every live user with their display role and groups. Creating and
 * editing happen in a dialog; removal is a soft delete behind a confirmation,
 * which is why the row disappears from this table but the user's history stays
 * intact.
 */
@Component({
  selector: 'admin-users',
  standalone: true,
  imports: [ZardBadgeComponent, ZardButtonComponent, ZardEmptyComponent, ...ZardTableImports],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div class="flex items-center gap-3">
        <div>
          <h2 class="text-lg font-semibold">Usuários</h2>
          <p class="text-sm text-muted-foreground">Crie contas e ajuste o cargo e grupos de cada pessoa.</p>
        </div>

        <button z-button class="ml-auto" type="button" (click)="openCreate()">Novo usuário</button>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Carregando usuários...</p>
      } @else if (error(); as message) {
        <z-empty zIcon="lucideUsers" zTitle="Não foi possível carregar" [zDescription]="message" />
      } @else if (users().length === 0) {
        <z-empty zIcon="lucideUsers" zTitle="Nenhum usuário" zDescription="Crie a primeira conta." />
      } @else {
        <div class="overflow-x-auto rounded-lg border">
          <table z-table zSize="compact">
            <thead z-table-header>
              <tr z-table-row>
                <th z-table-head>Nome</th>
                <th z-table-head>E-mail</th>
                <th z-table-head>Cargo</th>
                <th z-table-head>Grupos</th>
                <th z-table-head class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody z-table-body>
              @for (user of users(); track user.id) {
                <tr z-table-row>
                  <td z-table-cell>
                    <span class="font-medium">{{ user.name || user.username }}</span>
                    <span class="block text-xs text-muted-foreground">&#64;{{ user.username }}</span>
                  </td>
                  <td z-table-cell class="text-muted-foreground">{{ user.email || '—' }}</td>
                  <td z-table-cell>
                    @if (user.role) {
                      <z-badge zType="outline" class="gap-1">
                        <span class="size-2 rounded-full" [style.background]="user.role.color"></span>
                        {{ user.role.name }}
                      </z-badge>
                    } @else {
                      <span class="text-muted-foreground">Sem cargo</span>
                    }
                  </td>
                  <td z-table-cell>
                    @if (user.groups.length === 0) {
                      <span class="text-muted-foreground">Sem grupo</span>
                    } @else {
                      <span class="flex flex-wrap gap-1">
                        @for (group of user.groups; track group.id) {
                          <z-badge zType="outline" class="gap-1">
                            <span class="size-2 rounded-full" [style.background]="group.color"></span>
                            {{ group.name }}
                          </z-badge>
                        }
                      </span>
                    }
                  </td>
                  <td z-table-cell class="text-right">
                    <span class="flex justify-end gap-1">
                      <button z-button zType="outline" zSize="sm" type="button" (click)="openEdit(user)">
                        Editar
                      </button>
                      <button z-button zType="destructive" zSize="sm" type="button" (click)="confirmDelete(user)">
                        Remover
                      </button>
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideUsers })],
})
export class UsersAdminComponent {
  private readonly adminService = inject(AdminService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly confirmService = inject(AdminConfirmService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** The open create/edit dialog, so its result can trigger a reload. */
  private readonly userDialog = signal<ZardDialogRef<unknown> | null>(null);

  constructor() {
    this.reload();

    effect(() => {
      const user = this.userDialog()?.result() as AdminUser | undefined;
      if (!user) {
        return;
      }
      untracked(() => this.userDialog.set(null));
      this.reload();
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.adminService.listUsers().subscribe({
      next: users => {
        this.users.set(users);
        this.loading.set(false);
        this.error.set(null)
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Verifique suas permissões e tente novamente.');
      },
    });
  }

  protected async openCreate(): Promise<void> {
    const { UserAdminDialogComponent } = await import('./user-admin-dialog.component');
    this.openDialog('Novo usuário', { mode: 'create', component: UserAdminDialogComponent });
  }

  protected async openEdit(user: AdminUser): Promise<void> {
    const { UserAdminDialogComponent } = await import('./user-admin-dialog.component');
    this.openDialog('Editar usuário', { mode: 'edit', user, component: UserAdminDialogComponent });
  }

  private openDialog(
    title: string,
    options: { mode: UserAdminDialogData['mode']; user?: AdminUser; component: typeof import('./user-admin-dialog.component').UserAdminDialogComponent },
  ): void {
    this.userDialog.set(
      this.dialogService.create<unknown, UserAdminDialogData>({
        zTitle: title,
        zContent: options.component,
        zData: { mode: options.mode, user: options.user },
        zHideFooter: true,
        zWidth: '28rem',
        zCustomClasses: 'sm:max-w-lg',
      }),
    );
  }

  protected confirmDelete(user: AdminUser): void {
    this.confirmService.confirm({
      title: 'Remover usuário',
      description: `A conta de ${user.name || user.username} deixa de aparecer nas listas. O histórico permanece no banco.`,
      onConfirm: () => {
        this.adminService.deleteUser(user.id).subscribe({
          next: () => this.reload(),
          error: () => this.error.set('Não foi possível remover o usuário.'),
        });
      },
    });
  }
}