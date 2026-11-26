import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHash } from '@ng-icons/lucide';
import { filter, finalize, map } from 'rxjs';

import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardSkeletonComponent } from '@/shared/components/skeleton/skeleton.component';

import { MentionService } from '@/services/mention.service';
import { NotificationService } from '@/services/notification.service';
import { RoomNavigationService } from '@/services/room-navigation.service';
import { RoomService } from '@/services/room.service';

/**
 * Rooms screen: the public room list on the left, the selected room's chat on
 * the right. The selected room is a child route, so opening one keeps the list
 * mounted instead of replacing it.
 */
@Component({
  selector: 'chat-room-list',
  standalone: true,
  imports: [NgIcon, RouterOutlet, ZardEmptyComponent, ZardSkeletonComponent],
  // A component host is an inline custom element by default, so it needs to be
  // told to stretch or the flex row below has nothing to fill.
  host: {
    class: 'flex min-h-0 flex-1',
  },
  template: `
    <div class="flex lg:w-60 shrink-0 flex-col border-r md:w-48">
      <div class="flex h-14 shrink-0 items-center px-4">
        <h1 class="text-xl font-semibold">Início</h1>
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-2">
        @if (loading()) {
          @for (row of skeletonRows; track row) {
            <z-skeleton class="mb-1 h-10 w-full" />
          }
        } @else if (error(); as errorMessage) {
          <z-empty zIcon="lucideHash" zTitle="Não foi possível carregar" [zDescription]="errorMessage" />
        } @else if (rooms().length === 0) {
          <z-empty zIcon="lucideHash" zTitle="Nenhuma sala" zDescription="Não há salas públicas cadastradas." />
        } @else {
          <ul class="flex flex-col gap-1">
            @for (room of rooms(); track room.id) {
              <li>
                <button
                  type="button"
                  class="group flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none active:bg-accent/80"
                  [class.bg-accent]="selectedRoomId() === room.id"
                  [class.text-accent-foreground]="selectedRoomId() === room.id"
                  [attr.aria-current]="selectedRoomId() === room.id ? 'true' : null"
                  (click)="open(room)"
                >
                  <ng-icon
                    name="lucideHash"
                    class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground"
                  />
                  <span class="truncate">{{ room.name }}</span>

                  <span class="ml-auto flex shrink-0 items-center gap-1">
                    @if (mentions.unreadFor(room.id); as mentionCount) {
                      <span
                        class="flex h-5 min-w-5 items-center justify-center rounded-full bg-mention px-1.5 text-xs font-semibold text-mention-foreground"
                        [attr.aria-label]="mentionCount + ' menções não lidas'"
                        title="Você foi mencionado"
                      >
                        &#64;
                      </span>
                    }

                    @if (notifications.unreadFor(room.id); as unread) {
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
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <router-outlet />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHash })],
})
export class RoomListComponent {
  private readonly roomService = inject(RoomService);
  private readonly roomNavigation = inject(RoomNavigationService);
  private readonly router = inject(Router);

  protected readonly notifications = inject(NotificationService);
  protected readonly mentions = inject(MentionService);

  protected readonly skeletonRows = [1, 2, 3, 4];

  protected readonly rooms = signal<RoomResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly activeUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly selectedRoomId = computed(() =>
    /^\/chat\/rooms\/([^/?#]+)/.exec(this.activeUrl())?.[1] ?? null,
  );

  constructor() {
    this.roomService
      .getPublicRooms()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: rooms => this.rooms.set(rooms),
        error: () => this.error.set('Tente novamente em instantes.'),
      });

    // Remember the open room so the sidebar's "Início" entry can return to it.
    // Only the public-room route sets `selectedRoomId`, so a DM never becomes
    // the remembered target.
    effect(() => {
      const roomId = this.selectedRoomId();
      if (roomId) {
        this.roomNavigation.remember(roomId);
      }
    });
  }

  protected open(room: RoomResponse): void {
    this.router.navigate(['/chat/rooms', room.id]);
  }
}
