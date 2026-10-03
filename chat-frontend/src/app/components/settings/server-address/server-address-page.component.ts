import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideCircleAlert, lucideCircleCheck, lucideLoaderCircle, lucideRotateCcw, lucideServer } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card/card.imports';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';

import { ApiConfigService } from '@/services/api-config.service';

/**
 * Reuses the service's own parsing so the field rejects exactly what would not
 * be stored, instead of a second, subtly different URL rule.
 */
function apiUrlValidator(control: AbstractControl): ValidationErrors | null {
  return ApiConfigService.normalize(String(control.value ?? '')) ? null : { apiUrl: true };
}

type ProbeState = 'idle' | 'checking' | 'ok' | 'failed';

/**
 * Dedicated screen for pointing the client at a backend, reachable from the
 * login and register forms. It lives before any token exists, because that is
 * the only safe point to retarget: changing the address mid-session would send a
 * token issued by one backend to another.
 *
 * When the process environment supplies the address the field is read-only — that
 * value is an operator decision, not a per-machine preference.
 */
@Component({
  selector: 'app-server-address-page',
  imports: [NgIcon, ReactiveFormsModule, ZardButtonComponent, ZardInputComponent, ...ZardCardImports, ...ZardFieldImports],
  template: `
    <div class="h-full overflow-auto">
      <div class="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 p-6">
        <button
          z-button
          zType="ghost"
          zSize="sm"
          class="-ml-2 self-start"
          (click)="back()"
        >
          <ng-icon name="lucideArrowLeft" />
          Voltar
        </button>

        <z-card>
          <div z-card-header>
            <div class="flex items-center gap-2">
              <ng-icon name="lucideServer" class="size-4 text-muted-foreground" />
              <z-card-title zTitle="Endereço do servidor" />
            </div>
            <p z-card-description class="mt-1">
              Para onde o aplicativo envia as requisições e abre o WebSocket.
            </p>
          </div>

          <div z-card-content>
            <form [formGroup]="form" (ngSubmit)="save()">
              <div z-field-group>
                <div z-field [attr.data-invalid]="isInvalid() || null">
                  <label z-field-label for="apiUrl">Endereço do backend</label>
                  <input
                    z-input
                    id="apiUrl"
                    formControlName="apiUrl"
                    type="text"
                    placeholder="http://localhost:8080"
                    [attr.aria-invalid]="isInvalid() || null"
                    [readOnly]="config.locked()"
                  />

                  @if (isInvalid()) {
                    <z-field-error>Informe uma URL válida, como http://localhost:8080</z-field-error>
                  } @else if (config.locked()) {
                    <p z-field-description>
                      Definido pela variável de ambiente <code>CALLING_API_URL</code>. Não pode ser alterado aqui.
                    </p>
                  } @else {
                    <p z-field-description>
                      @if (config.source() === 'client') {
                        Salvo neste dispositivo.
                      } @else {
                        Padrão do aplicativo.
                      }
                    </p>
                  }
                </div>

                @if (!config.locked()) {
                  <div class="flex flex-wrap gap-2">
                    <button
                      z-button
                      zType="outline"
                      zSize="sm"
                      type="submit"
                      [zDisabled]="form.invalid || form.pristine"
                    >
                      Salvar
                    </button>

                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      (click)="test()"
                      [zDisabled]="probe() === 'checking' || isInvalid()"
                    >
                      @if (probe() === 'checking') {
                        <ng-icon name="lucideLoaderCircle" class="animate-spin duration-2000" />
                        Testando...
                      } @else {
                        Testar conexão
                      }
                    </button>

                    @if (config.source() === 'client') {
                      <button z-button zType="ghost" zSize="sm" type="button" (click)="reset()">
                        <ng-icon name="lucideRotateCcw" />
                        Restaurar padrão
                      </button>
                    }
                  </div>
                }

                @switch (probe()) {
                  @case ('ok') {
                    <p class="flex items-center gap-2 text-sm text-muted-foreground">
                      <ng-icon name="lucideCircleCheck" class="size-4 text-online" />
                      O servidor respondeu em {{ testedAddress() }}.
                    </p>
                  }
                  @case ('failed') {
                    <p role="alert" class="flex items-center gap-2 text-sm text-destructive">
                      <ng-icon name="lucideCircleAlert" class="size-4" />
                      {{ probeError() }}
                    </p>
                  }
                }
              </div>
            </form>
          </div>
        </z-card>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      lucideArrowLeft,
      lucideServer,
      lucideRotateCcw,
      lucideCircleCheck,
      lucideCircleAlert,
      lucideLoaderCircle,
    }),
  ],
})
export class ServerAddressPageComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected readonly config = inject(ApiConfigService);

  protected readonly form = new FormGroup({
    apiUrl: new FormControl(this.config.apiUrl(), {
      nonNullable: true,
      validators: [Validators.required, apiUrlValidator],
    }),
  });

  private readonly submitted = signal(false);
  private readonly testedUrl = signal<string | null>(null);

  protected readonly probe = signal<ProbeState>('idle');
  protected readonly probeError = signal<string | null>(null);
  protected readonly testedAddress = this.testedUrl.asReadonly();

  protected readonly isInvalid = computed(() => this.submitted() && this.form.invalid);

  /**
     * Returns to whichever screen sent the user here. The page is also reachable
     * directly, with no entry to go back to, so a missing history entry falls back
     * to login rather than leaving the app.
     *
     * `getState()` is typed `unknown`; Angular only puts a `navigationId` in it once
     * a router navigation has happened, which is exactly the signal we need.
     */
    protected back(): void {
      const state = this.location.getState();
      const navigated = typeof state === 'object' && state !== null && 'navigationId' in state;

      if (navigated) {
        this.location.back();
        return;
      }

      void this.router.navigate(['/login']);
    }

    protected save(): void {
    this.submitted.set(true);
    this.resetProbe();

    if (this.form.invalid) {
      return;
    }

    this.config.setApiUrl(this.form.controls.apiUrl.value);
    this.form.markAsPristine();
    this.submitted.set(false);
  }

  protected reset(): void {
    this.config.reset();
    this.form.setValue({ apiUrl: this.config.apiUrl() });
    this.form.markAsPristine();
    this.submitted.set(false);
    this.resetProbe();
  }

  /**
   * Confirms the host answers before the address is committed, so a typo shows
   * up here instead of as a failed login.
   *
   * Any HTTP status counts as reachable — an authenticated route answering 401
   * still proves a server is there. Only a transport failure is a failure. Raw
   * `fetch` is deliberate: going through `HttpClient` would let that 401 reach
   * `authInterceptor` and sign the user out over a connectivity probe.
   */
  protected async test(): Promise<void> {
    this.submitted.set(true);
    this.resetProbe();

    const target = ApiConfigService.normalize(this.form.controls.apiUrl.value);
    if (!target) {
      return;
    }

    this.probe.set('checking');

    try {
      await fetch(`${target}/users/online`, { method: 'GET', cache: 'no-store' });
      this.testedUrl.set(target);
      this.probe.set('ok');
    } catch {
      this.probeError.set('Não foi possível contatar o servidor nesse endereço.');
      this.probe.set('failed');
    }
  }

  private resetProbe(): void {
    this.probe.set('idle');
    this.probeError.set(null);
    this.testedUrl.set(null);
  }
}