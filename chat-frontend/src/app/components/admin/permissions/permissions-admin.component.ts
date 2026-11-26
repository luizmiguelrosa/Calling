import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { provideIcons } from '@ng-icons/core';
import { lucideKeyRound } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCheckboxComponent } from '@/shared/components/checkbox';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';

import { AdminService } from '@/services/admin.service';

/**
 * Permissions category: the general catalog applied to each role. A role holding
 * `admin.all` passes every check, which is why the wildcard is listed first and
 * saved like any other key.
 */
@Component({
  selector: 'admin-permissions',
  standalone: true,
  imports: [FormsModule, ZardButtonComponent, ZardCheckboxComponent, ZardEmptyComponent],
  template: `
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div>
        <h2 class="text-lg font-semibold">Permissões</h2>
        <p class="text-sm text-muted-foreground">
          Defina, por cargo, o que pode ser feito no painel e nas salas públicas.
        </p>
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Carregando permissões...</p>
      } @else if (error(); as message) {
        <z-empty zIcon="lucideKeyRound" zTitle="Não foi possível carregar" [zDescription]="message" />
      } @else if (roles().length === 0) {
        <z-empty zIcon="lucideKeyRound" zTitle="Nenhum cargo" zDescription="Crie um cargo para conceder permissões." />
      } @else {
        @for (role of roles(); track role.id) {
          <section class="rounded-lg border p-4">
            <div class="flex items-center gap-3">
              <h3 class="text-base font-medium">{{ role.name }}</h3>
              @if (savedRole() === role.id) {
                <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Salvo</span>
              }
              <button z-button zSize="sm" class="ml-auto" type="button" (click)="save(role)">Salvar</button>
            </div>

            <ul class="mt-3 grid gap-1 sm:grid-cols-2">
              @for (permission of catalog(); track permission.key) {
                <li class="rounded px-1 py-1 hover:bg-accent">
                  <z-checkbox
                    [ngModel]="selected(role).has(permission.key)"
                    (ngModelChange)="toggle(role, permission.key, $event)"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    <span class="flex items-center gap-2">
                      <span class="truncate">{{ permission.label }}</span>
                      <span class="truncate font-mono text-[10px] text-muted-foreground">{{ permission.key }}</span>
                    </span>
                  </z-checkbox>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideKeyRound })],
})
export class PermissionsAdminComponent {
  private readonly adminService = inject(AdminService);

  protected readonly roles = signal<AdminRole[]>([]);
  protected readonly catalog = signal<PermissionDefinition[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly savedRole = signal<string | null>(null);

  /** Pending checkboxes per role id; saved only from the section's button. */
  private readonly selections = signal<Record<string, ReadonlySet<string>>>({});

  constructor() {
    this.load();
  }

  protected selected(role: AdminRole): ReadonlySet<string> {
    return this.selections()[role.id] ?? new Set(role.permissions);
  }

  protected toggle(role: AdminRole, key: string, checked: boolean): void {
    this.selections.update(current => {
      const next = new Set(current[role.id] ?? role.permissions);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { ...current, [role.id]: next };
    });
    this.savedRole.set(null);
  }

  protected save(role: AdminRole): void {
    const permissions = [...this.selected(role)];

    this.adminService.setRolePermissions(role.id, { permissions }).subscribe({
      next: () => {
        this.savedRole.set(role.id);
        this.roles.update(roles =>
          roles.map(item => (item.id === role.id ? { ...item, permissions } : item)),
        );
      },
      error: () => this.error.set('Não foi possível salvar as permissões.'),
    });
  }

  private load(): void {
    forkJoin({
      roles: this.adminService.listRoles(),
      catalog: this.adminService.getPermissionCatalog(),
    }).subscribe({
      next: ({ roles, catalog }) => {
        this.roles.set(roles);
        this.catalog.set(catalog);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Verifique suas permissões e tente novamente.');
      },
    });
  }
}