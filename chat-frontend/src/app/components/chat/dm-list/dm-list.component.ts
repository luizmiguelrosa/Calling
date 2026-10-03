import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { provideIcons } from '@ng-icons/core';
import { lucideMessagesSquare } from '@ng-icons/lucide';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { initials as toInitials } from '@/shared/utils/initials';

import { ConversationService } from '@/services/conversation.service';

@Component({
  selector: 'chat-dm-list',
  standalone: true,
  imports: [ZardAvatarComponent, ZardEmptyComponent],
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  template: `
    <div class="flex h-14 shrink-0 items-center px-4">
      <h1 class="text-xl font-semibold">Mensagens</h1>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      @if (conversations.dms().length === 0) {
        <z-empty
          zIcon="lucideMessagesSquare"
          zTitle="Nenhuma conversa"
          zDescription="Use “Nova conversa” na barra lateral para começar uma."
        />
      } @else {
        <ul class="flex flex-col gap-1">
          @for (dm of conversations.dms(); track dm.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                (click)="open(dm)"
              >
                <z-avatar zSize="sm" [zFallback]="initials(dm.other_name || dm.other_username)" />
                <span class="truncate">{{ dm.other_name || dm.other_username }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideMessagesSquare })],
})
export class DmListComponent {
  private readonly router = inject(Router);

  protected readonly conversations = inject(ConversationService);

  /** Exposed for the template — an imported function is not in its scope. */
  protected readonly initials = toInitials;

  protected open(dm: DMRoomResponse): void {
    this.router.navigate(['/chat/room', dm.id]);
  }
}