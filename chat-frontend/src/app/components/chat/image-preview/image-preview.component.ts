import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

/**
 * Full-screen preview of a chat image.
 *
 * It is a plain fixed overlay rather than a `ZardDialogService` dialog: the
 * dialog's padding, rounded panel and `sm:max-w-sm` cap all fight an image that
 * should fill the viewport, and the backdrop here wants to be darker than the
 * dialog's. Clicking the backdrop or pressing Escape closes it; clicking the
 * image itself does not, so a stray click while looking does not dismiss it.
 */
@Component({
  selector: 'chat-image-preview',
  imports: [NgIcon],
  host: {
    class: 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150',
    role: 'dialog',
    'aria-modal': 'true',
    '(click)': 'onClose()',
    '(document:keydown.escape)': 'onClose()',
  },
  template: `
    <button
      type="button"
      class="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      aria-label="Fechar"
      title="Fechar"
      (click)="onClose(); $event.stopPropagation()"
    >
      <ng-icon name="lucideX" class="size-5" />
    </button>

    <img
      [src]="url()"
      [alt]="alt()"
      class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      (click)="$event.stopPropagation()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideX })],
})
export class ImagePreviewComponent {
  readonly url = input.required<string>();
  readonly alt = input('');
  readonly close = output<void>();

  protected onClose(): void {
    this.close.emit();
  }
}
