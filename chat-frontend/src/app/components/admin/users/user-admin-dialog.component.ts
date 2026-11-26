import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCheckboxComponent } from '@/shared/components/checkbox';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { injectDialogData } from '@/shared/components/dialog/dialog.service';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
} from '@/shared/utils/validation';

import { AdminService } from '@/services/admin.service';

/** What the users category hands the create/edit dialog. */
export interface UserAdminDialogData {
  mode: 'create' | 'edit';
  user?: AdminUser;
}

/**
 * Create/edit form for a user. The role and group lists are fetched on open.
 * A user has exactly one display role and may belong to several groups.
 */
@Component({
  selector: 'admin-user-dialog',
  standalone: true,
  imports: [
    FormsModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputComponent,
    ZardSelectImports,
    ...ZardFieldImports,
  ],
  template: `
    <div class="flex flex-col gap-3">
      <div z-field-group>
        @if (mode === 'create') {
          <div z-field [attr.data-invalid]="invalid('username') || null">
            <label z-field-label for="admin-user-username">Nome de usuário</label>
            <input
              z-input
              id="admin-user-username"
              type="text"
              autocomplete="username"
              [attr.maxlength]="USERNAME_MAX_LENGTH"
              [attr.aria-invalid]="invalid('username') || null"
              [value]="username()"
              (input)="username.set(valueOf($event))"
              (blur)="touch('username')"
            />
            @if (usernameError(); as message) {
              @if (show('username')) {
                <z-field-error>{{ message }}</z-field-error>
              }
            }
          </div>

          <div z-field [attr.data-invalid]="invalid('password') || null">
            <label z-field-label for="admin-user-password">Senha</label>
            <input
              z-input
              id="admin-user-password"
              type="password"
              autocomplete="new-password"
              [attr.maxlength]="PASSWORD_MAX_LENGTH"
              [attr.aria-invalid]="invalid('password') || null"
              [value]="password()"
              (input)="password.set(valueOf($event))"
              (blur)="touch('password')"
            />
            <p z-field-description>Entre 8 e 72 caracteres.</p>
            @if (passwordError(); as message) {
              @if (show('password')) {
                <z-field-error>{{ message }}</z-field-error>
              }
            }
          </div>
        }

        <div z-field [attr.data-invalid]="invalid('name') || null">
          <label z-field-label for="admin-user-name">Nome</label>
          <input
            z-input
            id="admin-user-name"
            type="text"
            autocomplete="name"
            [attr.maxlength]="NAME_MAX_LENGTH"
            [attr.aria-invalid]="invalid('name') || null"
            [value]="name()"
            (input)="name.set(valueOf($event))"
            (blur)="touch('name')"
          />
          @if (nameError(); as message) {
            @if (show('name')) {
              <z-field-error>{{ message }}</z-field-error>
            }
          }
        </div>

        <div z-field [attr.data-invalid]="invalid('email') || null">
          <label z-field-label for="admin-user-email">E-mail</label>
          <input
            z-input
            id="admin-user-email"
            type="email"
            autocomplete="email"
            [attr.maxlength]="EMAIL_MAX_LENGTH"
            [attr.aria-invalid]="invalid('email') || null"
            [value]="email()"
            (input)="email.set(valueOf($event))"
            (blur)="touch('email')"
          />
          @if (emailError(); as message) {
            @if (show('email')) {
              <z-field-error>{{ message }}</z-field-error>
            }
          }
        </div>

        <div z-field [attr.data-invalid]="show('role') && !roleId() ? true : null">
          <label z-field-label>Cargo</label>
          @if (roles().length === 0) {
            <p z-field-description>Nenhum cargo cadastrado.</p>
          } @else {
            <z-select [zValue]="roleId()" (zValueChange)="onRoleChange($event)">
              <z-select-item [zValue]="placeholder">Selecione um cargo</z-select-item>
              @for (role of roles(); track role.id) {
                <z-select-item [zValue]="role.id">
                  <span class="flex items-center gap-2">
                    <span class="size-3 shrink-0 rounded-full" [style.background]="role.color"></span>
                    <span class="truncate">{{ role.name }}</span>
                  </span>
                </z-select-item>
              }
            </z-select>
          }
          @if (show('role') && !roleId()) {
            <z-field-error>Selecione um cargo.</z-field-error>
          }
        </div>

        <div z-field [attr.data-invalid]="show('groups') && selectedGroupIds().size === 0 ? true : null">
          <label z-field-label>Grupos</label>
          @if (groups().length === 0) {
            <p z-field-description>Nenhum grupo cadastrado.</p>
          } @else {
            <ul class="flex max-h-48 flex-col gap-1 overflow-auto rounded-md border p-2">
              @for (group of groups(); track group.id) {
                <li class="rounded px-1 py-1 hover:bg-accent">
                  <z-checkbox
                    [ngModel]="selectedGroupIds().has(group.id)"
                    (ngModelChange)="toggleGroup(group.id)"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    <span class="flex items-center gap-2">
                      <span class="size-3 shrink-0 rounded-full" [style.background]="group.color"></span>
                      <span class="truncate">{{ group.name }}</span>
                    </span>
                  </z-checkbox>
                </li>
              }
            </ul>
          }
          @if (show('groups') && selectedGroupIds().size === 0) {
            <z-field-error>Selecione pelo menos um grupo.</z-field-error>
          }
        </div>
      </div>

      @if (error(); as message) {
        <p role="alert" class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ message }}
        </p>
      }

      <div class="mt-2 flex justify-end gap-2">
        <button z-button zType="outline" type="button" (click)="cancel()">Cancelar</button>
        <button z-button type="button" [zLoading]="saving()" [zDisabled]="saving()" (click)="save()">
          {{ mode === 'create' ? 'Criar usuário' : 'Salvar' }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAdminDialogComponent {
  private readonly data = injectDialogData<UserAdminDialogData>();
  private readonly adminService = inject(AdminService);
  private readonly dialogRef = inject(ZardDialogRef<unknown, AdminUser>);

  protected readonly mode = this.data.mode;

  /** Inputs rendered at the maximum the backend accepts. */
  protected readonly EMAIL_MAX_LENGTH = EMAIL_MAX_LENGTH;
  protected readonly NAME_MAX_LENGTH = NAME_MAX_LENGTH;
  protected readonly PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;
  protected readonly USERNAME_MAX_LENGTH = USERNAME_MAX_LENGTH;

  protected readonly username = signal(this.data.user?.username ?? '');
  protected readonly password = signal('');
  protected readonly name = signal(this.data.user?.name ?? '');
  protected readonly email = signal(this.data.user?.email ?? '');
  protected readonly roleId = signal(this.data.user?.role?.id ?? '');
  protected readonly placeholder = '__placeholder__';

  protected readonly roles = signal<AdminRoleRef[]>([]);
  protected readonly groups = signal<AdminGroupRef[]>([]);
  protected readonly selectedGroupIds = signal<ReadonlySet<string>>(
    new Set(this.data.user?.groups.map(g => g.id) ?? []),
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly attempted = signal(false);
  private readonly touched = signal<Record<string, boolean>>({});

  // The same rules the DTO enforces, evaluated as the user types so an invalid
  // value is caught before the request leaves the app.
  protected readonly usernameError = computed(() =>
    this.mode === 'create' ? validateUsername(this.username()) : null,
  );
  protected readonly passwordError = computed(() =>
    this.mode === 'create' ? validatePassword(this.password()) : null,
  );
  protected readonly nameError = computed(() => validateName(this.name()));
  protected readonly emailError = computed(() => validateEmail(this.email()));

  constructor() {
    this.adminService.listRoleOptions().subscribe({
      next: roles => this.roles.set(roles),
      error: () => this.error.set('Não foi possível carregar os cargos.'),
    });
    this.adminService.listGroupOptions().subscribe({
      next: groups => this.groups.set(groups),
      error: () => this.error.set('Não foi possível carregar os grupos.'),
    });
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected touch(field: string): void {
    this.touched.update(current => ({ ...current, [field]: true }));
  }

  /** A field's error is hidden until it is blurred or a save is attempted. */
  protected show(field: string): boolean {
    return this.attempted() || this.touched()[field] === true;
  }

  /** `data-invalid` / `aria-invalid` only when the error is actually shown. */
  protected invalid(field: string): boolean {
    return this.show(field) && !!this.fieldError(field);
  }

  private fieldError(field: string): string | null {
    switch (field) {
      case 'username':
        return this.usernameError();
      case 'password':
        return this.passwordError();
      case 'name':
        return this.nameError();
      case 'email':
        return this.emailError();
      default:
        return null;
    }
  }

  protected toggleGroup(groupId: string): void {
    this.selectedGroupIds.update(current => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
    this.touch('groups');
  }

  protected onRoleChange(value: string | string[]): void {
    this.roleId.set(Array.isArray(value) ? value[0] : value);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected save(): void {
    this.attempted.set(true);
    this.error.set(null);

    const formatInvalid =
      this.usernameError() || this.passwordError() || this.nameError() || this.emailError();
    const groupIds = [...this.selectedGroupIds()];
    if (formatInvalid || !this.roleId() || groupIds.length === 0) {
      return;
    }

    this.saving.set(true);

    const request$ =
      this.mode === 'create'
        ? this.adminService.createUser({
            username: this.username().trim(),
            password: this.password(),
            name: this.name().trim(),
            email: this.email().trim(),
            role_id: this.roleId(),
            group_ids: groupIds,
          })
        : this.adminService.updateUser(this.data.user!.id, {
            name: this.name().trim(),
            email: this.email().trim(),
            role_id: this.roleId(),
            group_ids: groupIds,
          });

    request$.subscribe({
      next: user => {
        this.saving.set(false);
        this.dialogRef.close(user)
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(describe(err, 'Não foi possível salvar o usuário.'));
      },
    });
  }
}

/** Surfaces the server's sentinel text without leaking the prefix. */
export function describe(err: unknown, fallback: string): string {
  if (!(err instanceof HttpErrorResponse)) {
    return fallback;
  }
  const message = (err.error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.replace(/^(unauthorized|not_found|conflict|forbidden|invalid):\s*/, '');
  }
  return `${fallback} (HTTP ${err.status})`;
}