import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { filter, finalize, map, switchMap } from 'rxjs';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHash } from '@ng-icons/lucide';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardSkeletonComponent } from '@/shared/components/skeleton/skeleton.component';
import { initials as toInitials } from '@/shared/utils/initials';

import { AuthService } from '@/services/auth.service';
import { ConversationService } from '@/services/conversation.service';
import { RoomService } from '@/services/room.service';
import { UserService } from '@/services/user.service';
import { WebSocketService } from '@/services/websocket.service';
import { MessageInputComponent } from '../message-input/message-input.component';

/** Messages closer together than this are treated as one burst. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/**
 * How close to the newest message counts as "following along". A small
 * tolerance means a scrollbar resting a few pixels short of the end still
 * follows new messages, which is where it sits once the list is long.
 */
const STICK_THRESHOLD_PX = 48;

/**
 * Read-only conversation view. Resolves the room from the route, loads its
 * history, and titles itself from the DM peer or the public room name.
 */
@Component({
  selector: 'chat-room',
  standalone: true,
  imports: [DatePipe, NgIcon, ScrollingModule, ZardAvatarComponent, ZardEmptyComponent, ZardSkeletonComponent, MessageInputComponent],
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  template: `
    <div class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      @if (dm(); as conversation) {
        <span class="relative shrink-0">
          <z-avatar zSize="sm" [zFallback]="initials(conversation.other_name || conversation.other_username)" />
          @if (isOnline(conversation.other_user_id)) {
            <span
              class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-online ring-2 ring-background"
              role="img"
              aria-label="Online"
            ></span>
          }
        </span>
        <h1 class="truncate text-base font-medium">
          {{ conversation.other_name || conversation.other_username }}
        </h1>
      } @else {
        <ng-icon name="lucideHash" class="size-4 shrink-0 text-muted-foreground" />
        <h1 class="truncate text-base font-medium">{{ roomName() ?? 'Conversa' }}</h1>
      }
    </div>

    @if (loading()) {
      <div class="flex flex-col gap-2 p-4">
        @for (row of skeletonRows; track row) {
          <z-skeleton class="h-10 w-full" />
        }
      </div>
    } @else if (error(); as errorMessage) {
      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <z-empty zIcon="lucideHash" zTitle="Não foi possível carregar" [zDescription]="errorMessage" />
      </div>
    } @else if (messageRows().length === 0) {
      <div class="flex min-h-0 flex-1 items-center justify-center p-4">
        <z-empty zIcon="lucideHash" zTitle="Nenhuma mensagem" zDescription="A conversa ainda está vazia." />
      </div>
    } @else {
      <!-- The virtual viewport is the scroll container and renders only the rows
           near the visible window. Reaching the last message is therefore an
           index, not a scrollHeight calculation: scrollToIndex positions the
           viewport against the total size the scroller already tracks, which is
           what the previous pixel arithmetic could not do reliably. -->
      <cdk-virtual-scroll-viewport
        #viewport
        class="min-h-0 flex-1 overflow-y-auto"
        [itemSize]="ITEM_SIZE_ESTIMATE"
        [minBufferPx]="400"
        [maxBufferPx]="800"
      >
        <div
          *cdkVirtualFor="let row of messageRows(); trackBy: trackRow"
          class="flex w-full px-4 py-1"
          [class.justify-end]="isOwn(row.message)"
        >
          <div class="max-w-[75%]">
            <div
              class="rounded-lg px-3 py-2 text-sm"
              [class.bg-primary]="isOwn(row.message)"
              [class.text-primary-foreground]="isOwn(row.message)"
              [class.bg-muted]="!isOwn(row.message)"
            >
              @if (!isOwn(row.message)) {
                <p class="mb-0.5 text-xs text-muted-foreground">{{ authorName(row.message.author) }}</p>
              }
              <p class="wrap-break-word whitespace-pre-wrap">{{ row.message.content }}</p>
            </div>

            @if (row.showTime) {
              <p
                class="mt-1 px-3 text-[10px] opacity-60"
                [class.text-right]="isOwn(row.message)"
              >
                {{ row.message.sentAt | date: 'HH:mm' }}
              </p>
            }
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    }

    <chat-message-input
      [disabled]="!socket.connected()"
      (send)="send($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHash })],
})
export class ChatRoomComponent {
  private readonly injector = inject(Injector);

  /**
   * Only an estimate for the fixed-size strategy: rows are wrapped text, so
   * their real heights vary. It affects how many rows are rendered per screen,
   * not where the last one sits.
   */
  protected readonly ITEM_SIZE_ESTIMATE = 56;

  private readonly route = inject(ActivatedRoute);
  private readonly roomService = inject(RoomService);
  private readonly userService = inject(UserService);
  private readonly conversations = inject(ConversationService);
  private readonly authService = inject(AuthService);
  protected readonly socket = inject(WebSocketService);

  protected readonly skeletonRows = [1, 2, 3, 4];

  /** Exposed for the template — an imported function is not in its scope. */
  protected readonly initials = toInitials;

  protected readonly currentUserId = this.authService.getUserId();

  protected readonly roomId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('id'))),
    { initialValue: null },
  );

  protected readonly messages = signal<MessageBroadcast[]>([]);
  protected readonly rooms = signal<RoomResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');

    /**
     * A pending request to move to the newest message, consumed by the effect
     * below. It cannot be a direct call: the history callback fires while
     * `loading()` is still true, so the viewport is not in the DOM yet and a
     * scroll requested at that moment silently does nothing.
     */
    private readonly intent = signal<'always' | 'if-following' | null>(null);

  protected readonly dm = computed(
    () => this.conversations.dms().find(room => room.id === this.roomId()) ?? null,
  );

  protected readonly roomName = computed(
    () => this.rooms().find(room => room.id === this.roomId())?.name ?? null,
  );

  /**
   * A burst of messages sent close together reads as one moment, so the
   * timestamp is carried by the last of a run rather than repeated on each.
   */
  protected readonly messageRows = computed(() => {
    const messages = this.messages();

    return messages.map((message, index) => {
      const next = messages[index + 1];
      const gapToNext = next ? new Date(next.sentAt).getTime() - new Date(message.sentAt).getTime() : Infinity;

      return { message, showTime: gapToNext >= GROUP_GAP_MS };
    });
  });

  constructor() {
    this.scrollWhenReady();

    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        filter((id): id is string => !!id),
        // A new room cancels the previous request and clears what was on screen.
        switchMap(roomId => {
          this.messages.set([]);
          this.error.set(null);
          this.loading.set(true);

          return this.roomService.getRoomHistory(roomId).pipe(finalize(() => this.loading.set(false)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: messages => {
          this.messages.set(messages);
          this.intent.set('always');
        },
        error: () => this.error.set('Tente novamente em instantes.'),
      });

    // Live messages for the room currently on screen. The socket itself is
    // owned by AppComponent — opening it per room left a connection behind on
    // every navigation.
    effect(
      () => {
        const roomId = this.roomId();
        const buffered = this.socket.incoming();
        if (!roomId) {
          return;
        }

        let appended = false;
        for (const message of buffered) {
          if (message.room_id === roomId && !this.messages().includes(message)) {
            this.messages.update(current => [...current, message]);
            appended = true;
          }
        }

        if (appended) {
          this.intent.set('if-following');
        }
      },
    );

    // Process incoming DM messages for rooms that don't exist locally yet.
    // This ensures that when a user receives a DM from someone they haven't
    // chatted with before, the conversation is created and displayed immediately.
    effect(
      () => {
        const buffered = this.socket.incoming();
        if (buffered.length === 0) {
          return;
        }

        const currentRoomId = this.roomId();
        for (const message of buffered) {
          // Skip messages for the current room (handled above)
          if (message.room_id === currentRoomId) {
            continue;
          }

          // Check if this is a DM message (not a public room)
          const isPublicRoom = this.rooms().some(room => room.id === message.room_id);
          if (isPublicRoom) {
            continue;
          }

          // Check if the DM conversation already exists locally
          const existingDm = this.conversations.dms().find(dm => dm.id === message.room_id);
          if (existingDm) {
            continue;
          }

          // This is a new DM message for a room that doesn't exist locally.
          // Get the author's user info and create the DM conversation.
          const authorUser = this.userService.getUserById(message.author);
          if (authorUser) {
            this.conversations.openDirectMessage(authorUser).subscribe({
              error: () => {
                // If we can't create the DM, log an error but don't crash.
                console.error('Failed to create DM conversation for incoming message');
              },
            });
          }
        }
      },
    );

    // History carries author IDs; the directory turns them into names.
    this.userService.loadOnce().subscribe({ error: () => undefined });

    this.roomService
      .getPublicRooms()
      .subscribe({ next: rooms => this.rooms.set(rooms), error: () => undefined });
  }

  protected authorName(userId: string): string {
    return this.userService.displayName(userId);
  }

  protected isOwn(message: MessageBroadcast): boolean {
    return message.author === this.currentUserId;
  }

  protected isOnline(userId: string): boolean {
    return this.userService.isOnline(userId);
  }

  /** Row identity for the virtual for-loop; index is stable for an append-only list. */
  protected trackRow(index: number): number {
    return index;
  }

  protected send(content: string): void {
    const roomId = this.roomId();
    if (!roomId || !this.socket.sendMessage(roomId, content)) {
      return;
    }

    // Sending re-attaches the viewport even if it had been scrolled up: the
    // point of sending is to see what you sent.
    this.intent.set('always');

    const message: MessageBroadcast = {
      room_id: roomId,
      author: this.currentUserId ?? '',
      content,
      sentAt: new Date().toISOString(),
    };

    this.messages.update(current => [...current, message]);
  }

  /**
   * Moves the viewport to the newest message once it exists.
   *
   * Two things have to be true, and both were failing separately:
   *
   * 1. The viewport must exist. The request comes from a data callback that runs
   *    while `loading()` is still true, so the scroller is not in the DOM yet and
   *    a direct call there finds `undefined`. Tracking `viewport()` means this
   *    runs again the moment it resolves.
   *
   * 2. The scroller must know its own size. A fresh virtual viewport has no
   *    measured height, and with none it has no scroll range to scroll, so the
   *    call silently lands at the top. `checkViewportSize` forces the
   *    measurement before the jump.
   */
  private scrollWhenReady(): void {
    effect(() => {
      const viewport = this.viewport();
      const intent = this.intent();
      const count = this.messageRows().length;

      if (!viewport || !intent || count === 0) {
        return;
      }

      // A reader scrolled up in history should not be yanked down by an incoming
      // message; opening the room or sending should always jump.
      if (intent === 'if-following' && viewport.measureScrollOffset('bottom') > STICK_THRESHOLD_PX) {
        this.intent.set(null);
        return;
      }

      this.intent.set(null);

      // afterNextRender needs an explicit injector: this runs inside an effect,
      // whose callback executes outside any injection context.
      afterNextRender(
        () => this.jumpToEnd(viewport, count - 1),
        { injector: this.injector },
      );
    });
  }

  private jumpToEnd(viewport: CdkVirtualScrollViewport, index: number): void {
    viewport.checkViewportSize();
    viewport.scrollToIndex(index, 'auto');

    // Scroll by index first so the scroller knows which range to render, then
    // settle on the true bottom. The fixed-size strategy estimates total height
    // from a uniform item size, so the index only gets close; the element's own
    // scrollHeight is the scroller's real total and needs no such estimate.
    requestAnimationFrame(() => {
      const element = viewport.elementRef.nativeElement;
      element.scrollTop = element.scrollHeight;
    });
  }
}