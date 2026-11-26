import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageSquarePlus, lucideReply } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';

/**
 * The right-click menu of a message. It is anchored at the pointer and only
 * offers actions the caller says are meaningful: "Reply" is always available,
 * while "Reply in private" is a public-room action and is left out of a DM.
 */
@Component({
  selector: 'chat-message-context-menu',
  standalone: true,
  imports: [NgIcon, ZardButtonComponent],
  template: `
    <!-- A full-screen layer catches the click that dismisses the menu, so the
         menu itself never has to guess whether a click landed outside it. -->
    <div class="fixed inset-0 z-40" (click)="dismiss.emit()" (contextmenu)="onBackdropContext($event)"></div>

    <div
      class="fixed z-50 w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      role="menu"
      [style.left.px]="x()"
      [style.top.px]="y()"
    >
      <button
        z-button
        zType="ghost"
        class="w-full justify-start gap-2"
        role="menuitem"
        (click)="reply.emit()"
      >
        <ng-icon name="lucideReply" />
        Responder
      </button>

      @if (canReplyPrivate()) {
        <button
          z-button
          zType="ghost"
          class="w-full justify-start gap-2"
          role="menuitem"
          (click)="replyPrivate.emit()"
        >
          <ng-icon name="lucideMessageSquarePlus" />
          Responder em particular
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideReply, lucideMessageSquarePlus })],
  host: {
    '(document:keydown.escape)': 'dismiss.emit()',
  },
})
export class MessageContextMenuComponent {
  readonly x = input.required<number>();
  readonly y = input.required<number>();
  /** Whether the "Reply in private" entry applies to this message and room. */
  readonly canReplyPrivate = input(false);

  readonly reply = output<void>();
  readonly replyPrivate = output<void>();
  readonly dismiss = output<void>();

  /** Opening the browser menu on top of the backdrop would hide this one. */
  protected onBackdropContext(event: MouseEvent): void {
    event.preventDefault();
    this.dismiss.emit();
  }
}