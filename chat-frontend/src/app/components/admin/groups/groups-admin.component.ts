import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';

import { provideIcons } from '@ng-icons/core';
import { lucideGroup } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardTableImports } from '@/shared/components/table';

import { AdminConfirmService } from '@/components/admin/shared/admin-confirm.service';

import { AdminService } from '@/services/admin.service';

import type { GroupAdminDialogData } from './group-admin-dialog.component';

/** Groups category: name, colour, members, permissions, and the edit/remove actions. */
@Component({
  selector: 'admin-groups',
  standalone: true,
  imports: [ZardButtonComponent, ZardEmptyComponent, ...ZardTableImports],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div class="flex items-center gap-3">
        <div>
          <h2 class="text-lg font-semibold">Grupos</h2>
          <p class="text-sm text-muted-foreground">Edite nome e cor dos grupos e ajuste quem pertence a cada um.</p>
        </div>

        <button z-button class="ml-auto" type="button" (click)="openCreate()">Novo grupo</button>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Carregando grupos...</p>
      } @else if (error(); as message) {
        <z-empty zIcon="lucideGroup" zTitle="Não foi possível carregar" [zDescription]="message" />
      } @else if (groups().length === 0) {
        <z-empty zIcon="lucideGroup" zTitle="Nenhum grupo" zDescription="Crie o primeiro grupo." />
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
              @for (group of groups(); track group.id) {
                <tr z-table-row>
                  <td z-table-cell class="font-medium">
                    <span class="flex items-center gap-2">
                      <span class="size-3 shrink-0 rounded-full" [style.background]="group.color"></span>
                      <span class="truncate">{{ group.name }}</span>
                    </span>
                  </td>
                  <td z-table-cell>
                    <span class="text-muted-foreground">{{ group.members.length }} membro(s)</span>
                    @if (group.members.length > 0) {
                      <span class="block truncate text-xs text-muted-foreground">
                        {{ memberNames(group) }}
                      </span>
                    }
                  </td>
                  <td z-table-cell class="text-right">
                    <span class="flex justify-end gap-1">
                      <button z-button zType="outline" zSize="sm" type="button" (click)="openEdit(group)">
                        Editar
                      </button>
                      <button z-button zType="destructive" zSize="sm" type="button" (click)="confirmDelete(group)">
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
  viewProviders: [provideIcons({ lucideGroup })],
})
export class GroupsAdminComponent {
  private readonly adminService = inject(AdminService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly confirmService = inject(AdminConfirmService);

  protected readonly groups = signal<AdminGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly groupDialog = signal<ZardDialogRef<unknown> | null>(null);

  constructor() {
    this.reload();

    effect(() => {
      const group = this.groupDialog()?.result() as AdminGroup | undefined;
      if (!group) {
        return;
      }
      untracked(() => this.groupDialog.set(null));
      this.reload();
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.adminService.listGroups().subscribe({
      next: groups => {
        this.groups.set(groups);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Verifique suas permissões e tente novamente.');
      },
    });
  }

  protected memberNames(group: AdminGroup): string {
    return group.members.map(member => member.name || member.username).join(', ');
  }

  protected async openCreate(): Promise<void> {
    const { GroupAdminDialogComponent } = await import('./group-admin-dialog.component');
    this.openDialog('Novo grupo', null, GroupAdminDialogComponent);
  }

  protected async openEdit(group: AdminGroup): Promise<void> {
    const { GroupAdminDialogComponent } = await import('./group-admin-dialog.component');
    this.openDialog('Editar grupo', group, GroupAdminDialogComponent);
  }

  private openDialog(
    title: string,
    group: AdminGroup | null,
    component: typeof import('./group-admin-dialog.component').GroupAdminDialogComponent,
  ): void {
    this.groupDialog.set(
      this.dialogService.create<unknown, GroupAdminDialogData>({
        zTitle: title,
        zContent: component,
        zData: { group },
        zHideFooter: true,
        zWidth: '28rem',
        zCustomClasses: 'sm:max-w-lg',
      }),
    );
  }

  protected confirmDelete(group: AdminGroup): void {
    this.confirmService.confirm({
      title: 'Remover grupo',
      description: `O grupo ${group.name} deixa de aparecer nas listas. Usuários que o tinham passam a mostrar “Grupo desconhecido”.`,
      onConfirm: () => {
        this.adminService.deleteGroup(group.id).subscribe({
          next: () => this.reload(),
          error: () => this.error.set('Não foi possível remover o grupo.'),
        });
      },
    });
  }
}