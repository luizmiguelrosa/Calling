import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideMinus, lucideSquare, lucideX } from '@ng-icons/lucide';

import { WindowService } from '@/services/window.service';

/**
 * Custom window chrome. The native title bar is turned off in `tauri.conf.json`,
 * so this has to supply the drag handle and the three window buttons itself.
 *
 * `data-tauri-drag-region` is what makes the bare area draggable; the buttons
 * sit outside it, otherwise a click would move the window instead of acting.
 */
@Component({
  selector: 'app-titlebar',
  imports: [NgIcon],
  host: {
    class: 'block shrink-0',
  },
  template: `
    <div class="flex h-9 select-none items-center border-b bg-sidebar" data-tauri-drag-region>
      <span class="flex-1 truncate px-3 text-xs font-medium text-muted-foreground" data-tauri-drag-region>
        Calling
      </span>

      <div class="flex h-full items-stretch">
        <button
          type="button"
          class="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Minimizar"
          (click)="window.minimize()"
        >
          <ng-icon name="lucideMinus" />
        </button>

        <button
          type="button"
          class="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          [attr.aria-label]="window.isMaximized() ? 'Restaurar' : 'Maximizar'"
          (click)="window.toggleMaximize()"
        >
          <ng-icon [name]="window.isMaximized() ? 'lucideCopy' : 'lucideSquare'" />
        </button>

        <button
          type="button"
          class="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          aria-label="Fechar"
          (click)="window.close()"
        >
          <ng-icon name="lucideX" />
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideMinus, lucideSquare, lucideCopy, lucideX })],
})
export class TitleBarComponent {
  protected readonly window = inject(WindowService);
}
