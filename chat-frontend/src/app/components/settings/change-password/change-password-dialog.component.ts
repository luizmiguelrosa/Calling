import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from '@/shared/utils/validation';

import { AuthService } from '@/services/auth.service';

/** Mirrors the backend's `min=8` / `max=72` on a password. */
const PASSWORD_MIN = PASSWORD_MIN_LENGTH;
const PASSWORD_MAX = PASSWORD_MAX_LENGTH;

/**
 * Self-service password change. The bootstrap system user reaches this from the
 * account menu to retire the default credentials; every other account can use it
 * the same way.
 */
@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [ZardButtonComponent, ZardInputComponent, ...ZardFieldImports],
  template: `
    @if (success()) {
      <div class="flex flex-col gap-4">
        <p class="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
          Senha alterada com sucesso.
        </p>
        <div class="flex justify-end">
          <button z-button type="button" (click)="close()">Fechar</button>
        </div>
      </div>
    } @else {
      <form class="flex flex-col gap-3" (submit)="submit($event)">
        <div z-field-group>
          <div z-field [attr.data-invalid]="invalid('current') || null">
            <label z-field-label for="change-password-current">Senha atual</label>
            <input
              z-input
              id="change-password-current"
              type="password"
              autocomplete="current-password"
              [attr.maxlength]="PASSWORD_MAX"
              [attr.aria-invalid]="invalid('current') || null"
              [value]="currentPassword()"
              (input)="currentPassword.set(valueOf($event))"
              (blur)="touch('current')"
            />
            @if (currentError(); as message) {
              @if (show('current')) {
                <z-field-error>{{ message }}</z-field-error>
              }
            }
          </div>

          <div z-field [attr.data-invalid]="invalid('new') || null">
            <label z-field-label for="change-password-new">Nova senha</label>
            <input
              z-input
              id="change-password-new"
              type="password"
              autocomplete="new-password"
              [attr.maxlength]="PASSWORD_MAX"
              [attr.aria-invalid]="invalid('new') || null"
              [value]="newPassword()"
              (input)="newPassword.set(valueOf($event))"
              (blur)="touch('new')"
            />
            <p z-field-description>Entre {{ PASSWORD_MIN }} e {{ PASSWORD_MAX }} caracteres.</p>
            @if (newError(); as message) {
              @if (show('new')) {
                <z-field-error>{{ message }}</z-field-error>
              }
            }
          </div>

          <div z-field [attr.data-invalid]="invalid('confirmation') || null">
            <label z-field-label for="change-password-confirmation">Confirmar nova senha</label>
            <input
              z-input
              id="change-password-confirmation"
              type="password"
              autocomplete="new-password"
              [attr.maxlength]="PASSWORD_MAX"
              [attr.aria-invalid]="invalid('confirmation') || null"
              [value]="confirmation()"
              (input)="confirmation.set(valueOf($event))"
              (blur)="touch('confirmation')"
            />
            @if (confirmationError(); as message) {
              @if (show('confirmation')) {
                <z-field-error>{{ message }}</z-field-error>
              }
            }
          </div>
        </div>

        @if (error(); as message) {
          <p role="alert" class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ message }}
          </p>
        }

        <div class="mt-2 flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="close()">Cancelar</button>
          <button z-button type="submit" [zLoading]="saving()" [zDisabled]="saving()">Alterar senha</button>
        </div>
      </form>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly dialogRef = inject(ZardDialogRef<unknown, unknown>);

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmation = signal('');
  protected readonly saving = signal(false);
  protected readonly success = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly PASSWORD_MIN = PASSWORD_MIN;
  protected readonly PASSWORD_MAX = PASSWORD_MAX;

  private readonly attempted = signal(false);
  private readonly touched = signal<Record<string, boolean>>({});

  protected readonly currentError = computed(() =>
    this.currentPassword() ? null : 'Informe a senha atual.',
  );
  protected readonly newError = computed(() => {
    const message = validatePassword(this.newPassword());
    if (message) {
      return message;
    }
    return this.newPassword() === this.currentPassword()
      ? 'A nova senha precisa ser diferente da atual.'
      : null;
  });
  protected readonly confirmationError = computed(() => {
    if (!this.confirmation()) {
      return 'Confirme a nova senha.';
    }
    return this.confirmation() === this.newPassword() ? null : 'As senhas não coincidem.';
  });

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected touch(field: string): void {
    this.touched.update(current => ({ ...current, [field]: true }));
  }

  protected show(field: string): boolean {
    return this.attempted() || this.touched()[field] === true;
  }

  /** `data-invalid` / `aria-invalid` only when the error is actually shown. */
  protected invalid(field: string): boolean {
    return this.show(field) && !!this.errorFor(field);
  }

  private errorFor(field: string): string | null {
    switch (field) {
      case 'current':
        return this.currentError();
      case 'new':
        return this.newError();
      case 'confirmation':
        return this.confirmationError();
      default:
        return null;
    }
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected submit(event: Event): void {
    event.preventDefault();

    this.attempted.set(true);
    this.error.set(null);

    if (this.currentError() || this.newError() || this.confirmationError()) {
      return;
    }

    this.saving.set(true);

    this.authService.changePassword(this.currentPassword(), this.newPassword()).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(describePasswordError(err));
      },
    });
  }
}

function describePasswordError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Não foi possível alterar a senha.';
  }

  // The endpoint reports a wrong current password as 401; a rejected new
  // password is a 400. Neither should ever surface the sentinel prefix.
  if (err.status === 401) {
    return 'Senha atual incorreta.';
  }

  const message = (err.error as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) {
    return message.join(' ');
  }
  if (typeof message === 'string' && message.trim()) {
    return message.replace(/^(unauthorized|not_found|conflict|forbidden|invalid):\s*/, '');
  }

  return 'Não foi possível alterar a senha.';
}