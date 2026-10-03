import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideServer } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardCardImports } from '@/shared/components/card/card.imports';
import { ZardFieldImports } from '@/shared/components/field';

import { ApiConfigService } from '@/services/api-config.service';
import { AuthService } from '@/services/auth.service';

/** Mirrors the backend's `min=3` / `max=32` on the username. */
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
/** Mirrors the backend's `min=2` / `max=64` on the name. */
const NAME_MIN = 2;
const NAME_MAX = 64;
/** Mirrors the backend's `min=8` / `max=72` on the password. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export function confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.parent?.get('password')?.value;
  const confirmPassword = control.value;

  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * Split feedback like the login screen: per-field validation under its input,
 * and the server's rejection as one message below the fields — a taken username
 * is the only failure the register endpoint reports, and it belongs to no
 * particular input.
 */
@Component({
  selector: 'register',
  standalone: true,
  imports: [NgIcon, ReactiveFormsModule, RouterLink, ZardButtonComponent, ZardInputComponent, ...ZardCardImports, ...ZardFieldImports],
  templateUrl: './register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideServer })],
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly config = inject(ApiConfigService);

  protected readonly isLoading = signal(false);
  /** Request-level failure: a taken username, or an unreachable host. */
  protected readonly error = signal<string | null>(null);

  /** Nobody has chosen an address yet, so the prompt below is shown. */
  protected readonly needsServerSetup = this.config.needsSetup;
  protected readonly serverLocked = this.config.locked;

  protected readonly registerForm = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(USERNAME_MIN), Validators.maxLength(USERNAME_MAX)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(NAME_MIN), Validators.maxLength(NAME_MAX)],
    }),
    role: new FormControl('Developer' as const, { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(PASSWORD_MIN), Validators.maxLength(PASSWORD_MAX)],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, confirmPasswordValidator],
    })
  });

  protected readonly usernameInvalid = computed(() => this.showError('username', 'required'));
  protected readonly usernameTooShort = computed(() => this.showError('username', 'minlength'));
  protected readonly usernameTooLong = computed(() => this.showError('username', 'maxlength'));
  protected readonly nameInvalid = computed(() => this.showError('name', 'required'));
  protected readonly nameTooShort = computed(() => this.showError('name', 'minlength'));
  protected readonly nameTooLong = computed(() => this.showError('name', 'maxlength'));
  protected readonly passwordInvalid = computed(() => this.showError('password', 'required'));
  protected readonly passwordTooShort = computed(() => this.showError('password', 'minlength'));
  protected readonly passwordTooLong = computed(() => this.showError('password', 'maxlength'));
  protected readonly confirmInvalid = computed(() => this.showError('confirmPassword', 'required'));
  protected readonly confirmMismatch = computed(() => this.showError('confirmPassword', 'passwordMismatch'));

  constructor() {
    this.registerForm.controls.password.valueChanges.subscribe(() => {
      this.registerForm.controls.confirmPassword.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const { username, name, role, password } = this.registerForm.getRawValue();

    try {
      await firstValueFrom(this.authService.register({ username, name, role, password }));
      void this.router.navigate(['/login']);
    } catch (err: unknown) {
      this.error.set(describeRegisterError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  private showError(control: string, error: string): boolean {
    const field = this.registerForm.get(control);
    return !!field?.touched && !!field.errors?.[error];
  }
}

/**
 * The register endpoint answers with `{"message": "..."}`, an array when the DTO
 * validator rejected the payload, and status 0 when the host is unreachable.
 * A 409 is the expected answer for a username that already exists.
 */
function describeRegisterError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Não foi possível registrar. Tente novamente.';
  }

  if (err.status === 0) {
    return 'Servidor inacessível. Confira o endereço em Servidor.';
  }

  if (err.status === 409) {
    return 'Este nome de usuário já está em uso.';
  }

  const message = (err.error as { message?: unknown } | null)?.message;

  if (Array.isArray(message)) {
    return message.join(' ');
  }

  if (typeof message === 'string' && message.trim()) {
    const detail = message.replace(/^(unauthorized|not_found|conflict|forbidden):\s*/, '');
    return detail || message;
  }

  return 'Não foi possível registrar. Tente novamente.';
}
