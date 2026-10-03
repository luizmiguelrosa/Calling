import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHash, lucideTriangleAlert } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';

import { RoomService } from '@/services/room.service';

/** Mirrors the backend's own constraint on room names. */
const NAME_MIN = 1;
const NAME_MAX = 64;

/**
 * Body of the "Nova sala" dialog. The room is created on submit and the created
 * room is returned through the dialog ref, so the caller can both refresh its
 * list and open the new room — without the list having to know how creation
 * happened.
 */
@Component({
  selector: 'app-new-room-dialog',
  imports: [NgIcon, ReactiveFormsModule, ZardButtonComponent, ZardInputComponent, ...ZardFieldImports],
  template: `
    <form [formGroup]="form" (ngSubmit)="create()">
      <div z-field-group>
        <div z-field [attr.data-invalid]="isInvalid() || null">
          <label z-field-label for="roomName">Nome da sala</label>
          <input
            z-input
            id="roomName"
            formControlName="name"
            type="text"
            placeholder="marketing"
            autofocus
            [attr.aria-invalid]="isInvalid() || null"
          />

          @if (isInvalid()) {
            <z-field-error>Dê um nome para a sala.</z-field-error>
          } @else {
            <p z-field-description>Todos na empresa com acesso ao servidor verão a sala.</p>
          }
        </div>

        @if (error(); as message) {
          <p role="alert" class="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <ng-icon name="lucideTriangleAlert" class="size-4 shrink-0" />
            {{ message }}
          </p>
        }

        <div class="flex justify-end gap-2">
          <button z-button zType="outline" type="button" (click)="cancel()">Cancelar</button>
          <button
            z-button
            type="submit"
            [zLoading]="creating()"
            [zDisabled]="creating() || form.invalid"
          >
            <ng-icon name="lucideHash" />
            Criar sala
          </button>
        </div>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHash, lucideTriangleAlert })],
})
export class NewRoomDialogComponent {
  private readonly roomService = inject(RoomService);
  private readonly dialogRef = inject(ZardDialogRef<unknown, RoomResponse>);

  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(NAME_MIN), Validators.maxLength(NAME_MAX)],
    }),
  });

  private readonly submitted = signal(false);

  protected readonly isInvalid = computed(() => this.submitted() && this.form.invalid);

  protected async create(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);

    if (this.form.invalid) {
      return;
    }

    this.creating.set(true);

    try {
      const room = await firstValueFrom(this.roomService.createRoom(this.form.controls.name.value.trim()));
      this.dialogRef.close(room);
    } catch (err: unknown) {
      this.error.set(describeCreateError(err));
    } finally {
      this.creating.set(false);
    }
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}

/**
 * The endpoint answers 409 when the name is taken. Everything else falls back to
 * a generic line rather than showing a status code to someone naming a room.
 */
function describeCreateError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 409) {
      return 'Já existe uma sala com esse nome.';
    }

    if (err.status === 0) {
      return 'Servidor inacessível. Confira o endereço em Servidor.';
    }

    const message = (err.error as { message?: unknown } | null)?.message;
    if (Array.isArray(message)) {
      return message.join(' ');
    }
    if (typeof message === 'string' && message.trim()) {
      return message.replace(/^(conflict|unauthorized|not_found|forbidden):\s*/, '');
    }
  }

  return 'Não foi possível criar a sala. Tente novamente.';
}