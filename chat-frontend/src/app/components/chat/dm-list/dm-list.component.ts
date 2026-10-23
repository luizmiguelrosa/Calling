import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { provideIcons } from '@ng-icons/core';
import { lucideMessagesSquare } from '@ng-icons/lucide';

import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';

import { ConversationService } from '@/services/conversation.service';
import { MentionService } from '@/services/mention.service';
import { NotificationService } from '@/services/notification.service';

import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

@Component({
  selector: 'chat-dm-list',
  standalone: true,
  imports: [UserAvatarComponent, ZardEmptyComponent],
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
                <app-user-avatar
                  [userId]="dm.other_user_id"
                  [name]="dm.other_name"
                  [username]="dm.other_username"
                />
                <span class="truncate">{{ dm.other_name || dm.other_username }}</span>

                <span class="ml-auto flex shrink-0 items-center gap-1">
                  @if (mentions.unreadFor(dm.id); as mentionCount) {
                    <span
                      class="flex h-5 min-w-5 items-center justify-center rounded-full bg-mention px-1.5 text-xs font-semibold text-mention-foreground"
                      [attr.aria-label]="mentionCount + ' menções não lidas'"
                      title="Você foi mencionado"
                    >
                      &#64;
                    </span>
                  }

                  @if (notifications.unreadFor(dm.id); as unread) {
                    <span
                      class="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums"
                      [attr.aria-label]="unread + ' mensagens não lidas'"
                    >
                      {{ unread }}
                    </span>
                  }
                </span>
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
  protected readonly notifications = inject(NotificationService);
  protected readonly mentions = inject(MentionService);

  protected open(dm: DMRoomResponse): void {
    this.router.navigate(['/chat/room', dm.id]);
  }
}