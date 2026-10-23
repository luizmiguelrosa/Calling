import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideServer } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardCardImports } from '@/shared/components/card/card.imports';
import { ZardFieldImports } from '@/shared/components/field';

import { ApiConfigService } from '@/services/api-config.service';
import { AuthService } from '@/services/auth.service';
import { UserService } from '@/services/user.service';
import { WebSocketService } from '@/services/websocket.service';

/** Mirrors the backend's `min=3` on the username. */
const USERNAME_MIN = 3;
/** Mirrors the backend's `min=8` / `max=72` on the password. */
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/**
 * Two kinds of failure are shown in two places, because they mean different
 * things to the person typing:
 *
 * - Field validation is attached to its input, since it is about that value and
 *   the fix is to change it.
 * - Anything the server refused (bad credentials, an unreachable host, a
 *   malformed request) is a single message below the fields: it is not tied to
 *   one input, and scattering it would suggest otherwise.
 */
@Component({
  selector: 'login',
  standalone: true,
  imports: [NgIcon, ReactiveFormsModule, RouterLink, ZardButtonComponent, ZardInputComponent, ...ZardCardImports, ...ZardFieldImports],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideEye, lucideEyeOff, lucideServer })],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly socket = inject(WebSocketService);
  private readonly userService = inject(UserService);
  private readonly config = inject(ApiConfigService);

  protected readonly isLoading = signal(false);
  /** Request-level failure: credentials, connectivity, or server rejection. */
  protected readonly error = signal<string | null>(null);

  /** Nobody has chosen an address yet, so the prompt below is shown. */
  protected readonly needsServerSetup = this.config.needsSetup;
  protected readonly serverLocked = this.config.locked;

  protected readonly loginForm = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(USERNAME_MIN)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(PASSWORD_MIN),
        Validators.maxLength(PASSWORD_MAX),
      ],
    }),
  });

  constructor() {
    // Editing the form invalidates the previous rejection, so the message does
    // not linger over a value the user has already changed.
    this.loginForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(null));
  }

  /** Whether the password is currently revealed by the toggle. */
  protected readonly showPassword = signal(false);

  protected usernameInvalid(): boolean {
    return this.showError('username', 'required');
  }

  protected usernameTooShort(): boolean {
    return this.showError('username', 'minlength');
  }

  protected passwordInvalid(): boolean {
    return this.showError('password', 'required');
  }

  protected passwordTooShort(): boolean {
    return this.showError('password', 'minlength');
  }

  protected passwordTooLong(): boolean {
    return this.showError('password', 'maxlength');
  }

  protected togglePassword(): void {
    this.showPassword.update(show => !show);
  }

  protected async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const { username, password } = this.loginForm.getRawValue();

    try {
      const response = await firstValueFrom(this.authService.login(username, password));

      if (!response?.accessToken) {
        this.error.set('O servidor não devolveu um token.');
        return;
      }

      this.authService.setSession(response);
      this.socket.connect();
      this.userService.loadOnline();
      void this.router.navigate(['/chat']);
    } catch (err: unknown) {
      this.error.set(describeLoginError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Surfaced once the field has been interacted with — typed into or left — so
   * the message does not appear before the user has had a chance to fill it.
   *
   * These are plain methods rather than `computed`: `touched`, `dirty`, and
   * `errors` are not signals, so a computed would cache its first value and never
   * re-evaluate when the form state changes.
   */
  private showError(control: string, error: string): boolean {
    const field = this.loginForm.get(control);
    return !!(field?.dirty || field?.touched) && !!field.errors?.[error];
  }
}

/**
 * The backend answers with `{"message": "..."}` — sometimes an array, from the
 * DTO validator — and a network failure arrives with status 0 and no body.
 * Anything unrecognised falls back to a generic line rather than leaking a
 * status code at someone trying to sign in.
 */
function describeLoginError(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return 'Não foi possível entrar. Tente novamente.';
  }

  if (err.status === 0) {
    return 'Servidor inacessível. Confira o endereço em Servidor.';
  }

  // A wrong password is a 401 and an unknown user a 404. Both get the same line,
  // and it is checked before the body so the server's English sentinel text
  // never reaches the screen — nor reveals which usernames exist.
  if (err.status === 401 || err.status === 404) {
    return 'Usuário ou senha inválidos.';
  }

  const message = (err.error as { message?: unknown } | null)?.message;

  if (Array.isArray(message)) {
    return message.join(' ');
  }

  if (typeof message === 'string' && message.trim()) {
    // Service errors carry a sentinel prefix (`unauthorized:`, `not_found:`)
    // meant for the status mapping, not for display.
    const detail = message.replace(/^(unauthorized|not_found|conflict|forbidden):\s*/, '');
    return detail || message;
  }

  return 'Não foi possível entrar. Tente novamente.';
}
