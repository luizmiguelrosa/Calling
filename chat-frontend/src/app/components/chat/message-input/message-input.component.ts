import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSend } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardTextareaComponent } from '@/shared/components/textarea/textarea.component';

/**
 * Composer at the foot of a conversation. Enter sends, Shift+Enter breaks the
 * line; the backend caps a message at 500 characters, so the counter is shown
 * only once the limit is in reach.
 */
@Component({
  selector: 'chat-message-input',
  standalone: true,
  imports: [NgIcon, ZardButtonComponent, ZardTextareaComponent],
  host: {
    class: 'shrink-0 border-t bg-background/60 p-3 sm:p-4',
  },
  template: `
    <div class="mx-auto flex w-full max-w-3xl items-end gap-2">
      <textarea
        z-textarea
        rows="1"
        placeholder="Escreva uma mensagem..."
        aria-label="Mensagem"
        class="max-h-32 min-h-11 flex-1 resize-none rounded-2xl py-2.5"
        [value]="value()"
        (input)="onInput($event)"
        (keydown.enter)="onEnter($event)"
      ></textarea>

      <button
        z-button
        zType="default"
        zSize="icon-lg"
        zShape="circle"
        class="mb-0.5 shrink-0"
        aria-label="Enviar"
        [zDisabled]="!canSend()"
        (click)="submit()"
      >
        <ng-icon name="lucideSend" />
      </button>
    </div>

    @if (value().length > 400) {
      <p
        class="mx-auto mt-1.5 w-full max-w-3xl text-right text-xs tabular-nums"
        [class.text-destructive]="overLimit()"
      >
        {{ value().length }}/500
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideSend })],
})
export class MessageInputComponent {
  readonly disabled = input(false);

  readonly send = output<string>();

  protected readonly value = signal('');

  protected readonly overLimit = () => this.value().length > 500;
  protected readonly canSend = () => this.value().trim().length > 0 && !this.overLimit() && !this.disabled();

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEnter(event: Event): void {
    // Template event bindings hand over a plain Event, so narrow it here.
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }

    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    if (!this.canSend()) {
      return;
    }

    this.send.emit(this.value().trim());
    this.value.set('');
  }
}