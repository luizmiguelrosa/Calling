import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';

import { provideIcons } from '@ng-icons/core';
import { lucideShield } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardTableImports } from '@/shared/components/table';

import { AdminConfirmService } from '@/components/admin/shared/admin-confirm.service';

import { AdminService } from '@/services/admin.service';

import type { RoleAdminDialogData } from './role-admin-dialog.component';

/** Roles category: name, colour, members, and the edit/remove actions. */
@Component({
  selector: 'admin-roles',
  standalone: true,
  imports: [ZardButtonComponent, ZardEmptyComponent, ...ZardTableImports],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div class="flex items-center gap-3">
        <div>
          <h2 class="text-lg font-semibold">Cargos</h2>
          <p class="text-sm text-muted-foreground">Edite nome e cor dos cargos e ajuste quem pertence a cada um.</p>
        </div>

        <button z-button class="ml-auto" type="button" (click)="openCreate()">Novo cargo</button>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Carregando cargos...</p>
      } @else if (error(); as message) {
        <z-empty zIcon="lucideShield" zTitle="Não foi possível carregar" [zDescription]="message" />
      } @else if (roles().length === 0) {
        <z-empty zIcon="lucideShield" zTitle="Nenhum cargo" zDescription="Crie o primeiro cargo." />
      } @else {
        <div class="overflow-x-auto rounded-lg border">
          <table z-table zSize="compact">
            <thead z-table-header>
              <tr z-table-row>
                <th z-table-head>Nome</th>
                <th z-table-head>Membros</th>
                <th z-table-head class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody z-table-body>
              @for (role of roles(); track role.id) {
                <tr z-table-row>
                  <td z-table-cell class="font-medium">
                    <span class="flex items-center gap-2">
                      <span class="size-3 shrink-0 rounded-full" [style.background]="role.color"></span>
                      <span class="truncate">{{ role.name }}</span>
                    </span>
                  </td>
                  <td z-table-cell>
                    <span class="text-muted-foreground">{{ role.members.length }} membro(s)</span>
                    @if (role.members.length > 0) {
                      <span class="block truncate text-xs text-muted-foreground">
                        {{ memberNames(role) }}
                      </span>
                    }
                  </td>
                  <td z-table-cell class="text-right">
                    <span class="flex justify-end gap-1">
                      <button z-button zType="outline" zSize="sm" type="button" (click)="openEdit(role)">
                        Editar
                      </button>
                      <button z-button zType="destructive" zSize="sm" type="button" (click)="confirmDelete(role)">
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
  viewProviders: [provideIcons({ lucideShield })],
})
export class RolesAdminComponent {
  private readonly adminService = inject(AdminService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly confirmService = inject(AdminConfirmService);

  protected readonly roles = signal<AdminRole[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly roleDialog = signal<ZardDialogRef<unknown> | null>(null);

  constructor() {
    this.reload();

    effect(() => {
      const role = this.roleDialog()?.result() as AdminRole | undefined;
      if (!role) {
        return;
      }
      untracked(() => this.roleDialog.set(null));
      this.reload();
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.adminService.listRoles().subscribe({
      next: roles => {
        this.roles.set(roles);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Verifique suas permissões e tente novamente.');
      },
    });
  }

  protected memberNames(role: AdminRole): string {
    return role.members.map(member => member.name || member.username).join(', ');
  }

  protected async openCreate(): Promise<void> {
    const { RoleAdminDialogComponent } = await import('./role-admin-dialog.component');
    this.openDialog('Novo cargo', null, RoleAdminDialogComponent);
  }

  protected async openEdit(role: AdminRole): Promise<void> {
    const { RoleAdminDialogComponent } = await import('./role-admin-dialog.component');
    this.openDialog('Editar cargo', role, RoleAdminDialogComponent);
  }

  private openDialog(
    title: string,
    role: AdminRole | null,
    component: typeof import('./role-admin-dialog.component').RoleAdminDialogComponent,
  ): void {
    this.roleDialog.set(
      this.dialogService.create<unknown, RoleAdminDialogData>({
        zTitle: title,
        zContent: component,
        zData: { role },
        zHideFooter: true,
        zWidth: '28rem',
        zCustomClasses: 'sm:max-w-lg',
      }),
    );
  }

  protected confirmDelete(role: AdminRole): void {
    this.confirmService.confirm({
      title: 'Remover cargo',
      description: `O cargo ${role.name} deixa de aparecer nas listas. Usuários que o tinham passam a mostrar “Cargo desconhecido”.`,
      onConfirm: () => {
        this.adminService.deleteRole(role.id).subscribe({
          next: () => this.reload(),
          error: () => this.error.set('Não foi possível remover o cargo.'),
        });
      },
    });
  }
}