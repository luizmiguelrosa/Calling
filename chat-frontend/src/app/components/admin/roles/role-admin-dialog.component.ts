import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { injectDialogData } from '@/shared/components/dialog/dialog.service';
import { ZardFieldImports } from '@/shared/components/field';

import { AdminConfirmService } from '@/components/admin/shared/admin-confirm.service';
import { describe } from '@/components/admin/users/user-admin-dialog.component';

import { AdminService } from '@/services/admin.service';

/** What the roles category hands the create/edit dialog. */
export interface RoleAdminDialogData {
  role: AdminRole | null;
}

/** The colour a new role starts with, matching the backend default. */
const DEFAULT_ROLE_COLOR = '#00519F';

/**
 * Create/edit a role (name and colour) and manage its members. Removing a member
 * only drops that membership; the user account, its other roles, and its history
 * stay intact.
 */
@Component({
  selector: 'admin-role-dialog',
  standalone: true,
  imports: [ZardButtonComponent, ZardInputComponent, ...ZardFieldImports],
  template: `
    <div class="flex flex-col gap-3">
      <div z-field-group>
        <div z-field>
          <label z-field-label for="admin-role-name">Nome do cargo</label>
          <input
            z-input
            id="admin-role-name"
            type="text"
            [value]="name()"
            (input)="name.set(valueOf($event))"
          />
        </div>

        <div z-field>
          <label z-field-label for="admin-role-color">Cor</label>
          <span class="flex items-center gap-2">
            <input
              id="admin-role-color"
              type="color"
              class="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
              [value]="color()"
              (input)="color.set(valueOf($event))"
            />
            <span class="text-sm text-muted-foreground">{{ color() }}</span>
            <span class="ml-auto size-3 rounded-full" [style.background]="color()"></span>
          </span>
        </div>
      </div>

      @if (role(); as current) {
        <div class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Membros</span>
          @if (current.members.length === 0) {
            <p class="text-muted-foreground">Nenhum membro neste cargo.</p>
          } @else {
            <ul class="flex flex-col divide-y rounded-md border">
              @for (member of current.members; track member.id) {
                <li class="flex items-center gap-3 px-3 py-2">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{{ member.name || member.username }}</span>
                    <span class="block truncate text-xs text-muted-foreground">{{ member.email }}</span>
                  </span>
                  <span class="flex shrink-0 flex-wrap justify-end gap-1">
                    @if (member.role) {
                      <span
                        class="rounded-full px-2 py-0.5 text-xs"
                        [style.background]="member.role.color"
                        [style.color]="'#ffffff'"
                      >
                        {{ member.role.name }}
                      </span>
                    }
                    @for (memberGroup of member.groups; track memberGroup.id) {
                      <span
                        class="rounded-full px-2 py-0.5 text-xs"
                        [style.background]="memberGroup.color"
                        [style.color]="'#ffffff'"
                      >
                        {{ memberGroup.name }}
                      </span>
                    }
                  </span>
                  <button z-button zType="destructive" zSize="sm" type="button" (click)="removeMember(member)">
                    Remover
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }

      @if (error(); as message) {
        <p role="alert" class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ message }}
        </p>
      }

      <div class="mt-2 flex justify-end gap-2">
        <button z-button zType="outline" type="button" (click)="cancel()">Cancelar</button>
        <button z-button type="button" [zLoading]="saving()" [zDisabled]="saving()" (click)="save()">
          {{ role() ? 'Salvar' : 'Criar cargo' }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleAdminDialogComponent {
  private readonly data = injectDialogData<RoleAdminDialogData>();
  private readonly adminService = inject(AdminService);
  private readonly confirmService = inject(AdminConfirmService);
  private readonly dialogRef = inject(ZardDialogRef<unknown, AdminRole>);

  protected readonly role = signal<AdminRole | null>(this.data.role);
  protected readonly name = signal(this.data.role?.name ?? '');
  protected readonly color = signal(this.data.role?.color ?? DEFAULT_ROLE_COLOR);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected save(): void {
    if (!this.name().trim()) {
      this.error.set('Informe o nome do cargo.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const input = { name: this.name().trim(), color: this.color() };
    const current = this.role();
    const request$ = current
      ? this.adminService.updateRole(current.id, input)
      : this.adminService.createRole(input);

    request$.subscribe({
      next: role => {
        this.saving.set(false);
        this.dialogRef.close(role);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(describe(err, 'Não foi possível salvar o cargo.'));
      },
    });
  }

  protected removeMember(member: AdminMember): void {
    const current = this.role();
    if (!current) {
      return;
    }

    this.confirmService.confirm({
      title: 'Remover do cargo',
      description: `${member.name || member.username} deixa de pertencer a ${current.name}.`,
      okText: 'Remover',
      onConfirm: () => {
        this.adminService.removeRoleMember(current.id, member.id).subscribe({
          next: () => {
            this.role.update(role =>
              role ? { ...role, members: role.members.filter(item => item.id !== member.id) } : role,
            );
          },
          error: () => this.error.set('Não foi possível remover o membro.'),
        });
      },
    });
  }
}
