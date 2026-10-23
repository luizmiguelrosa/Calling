import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { filter, finalize, forkJoin, map, switchMap, tap } from 'rxjs';

import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBell, lucideBellOff, lucideDownload, lucideFile, lucideHash, lucideLoaderCircle } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardSkeletonComponent } from '@/shared/components/skeleton/skeleton.component';
import { segmentMessage } from '@/shared/utils/mentions';

import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

import type { MentionDialogData } from '@/components/dialog/mention/mention-dialog.component';

import { AuthService } from '@/services/auth.service';
import { ConversationService } from '@/services/conversation.service';
import { ExternalLinkService } from '@/services/external-link.service';
import { FileService } from '@/services/file.service';
import { ImageCacheService } from '@/services/image-cache.service';
import { MentionService } from '@/services/mention.service';
import { NotificationService } from '@/services/notification.service';
import { RoomService } from '@/services/room.service';
import { UserService } from '@/services/user.service';
import { WebSocketService } from '@/services/websocket.service';
import { MessageInputComponent, OutgoingMessage } from '../message-input/message-input.component';
import { ImagePreviewComponent } from '../image-preview/image-preview.component';

/** Messages closer together than this are treated as one burst. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** How often a "still typing" refresh is re-sent while the user keeps typing. */
const TYPING_REFRESH_MS = 2000;
/** How long after the last keystroke the "stopped typing" frame is sent. */
const TYPING_IDLE_MS = 2500;

/**
 * How close to the newest message counts as "following along". A small
 * tolerance means a scrollbar resting a few pixels short of the end still
 * follows new messages, which is where it sits once the list is long.
 */
const STICK_THRESHOLD_PX = 48;

/**
 * Stable identity for a message. The server stamps `sentAt` per message, so the
 * tuple of room, author, timestamp, and content is unique in practice — which is
 * what lets a reloaded history and a live broadcast be recognised as the same
 * message even though they are different objects.
 *
 * The timestamp is compared as an instant, not as text. A live broadcast
 * serializes `sentAt` in UTC while a history read comes back in the server's
 * local zone, so the same moment yields two different strings; a string key
 * would treat the reloaded history copy as a new message and append it a second
 * time, which is what scrambled the order and duplicated the message. Parsing to
 * epoch milliseconds makes the identity independent of how it was formatted.
 */
function messageKey(message: MessageBroadcast): string {
  const instant = new Date(message.sentAt).getTime();
  const stamp = Number.isNaN(instant) ? message.sentAt : String(instant);
  return `${message.room_id}\u0000${message.author}\u0000${stamp}\u0000${message.content}`;
}

/**
 * A file message carries its metadata as JSON in `content`; a plain message's
 * content is the text itself. Parsing here keeps the distinction out of the
 * template, and a malformed payload simply renders as a text message.
 */
function parseAttachment(message: MessageBroadcast): FileAttachment | null {
  if (!message.is_file) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.content) as FileAttachment;
    return parsed && typeof parsed.path === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** The formats the browser can render as a picture; everything else downloads. */
const IMAGE_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Whether an attachment should be shown as a picture. Messages stored before
 * arbitrary files were supported carry no `format`, and every one of them is an
 * image, so an absent format falls back to the preview branch.
 */
function isImageAttachment(attachment: FileAttachment): boolean {
  const format = attachment.format?.toLowerCase();
  if (!format) {
    return true;
  }
  return IMAGE_FORMATS.has(format);
}

/**
 * Read-only conversation view. Resolves the room from the route, loads its
 * history, and titles itself from the DM peer or the public room name.
 */
@Component({
  selector: 'chat-room',
  standalone: true,
  imports: [DatePipe, NgIcon, ScrollingModule, ZardButtonComponent, ZardEmptyComponent, ZardSkeletonComponent, UserAvatarComponent, MessageInputComponent, ImagePreviewComponent],
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  template: `
    <div class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      @if (dm(); as conversation) {
        <span class="relative shrink-0">
          <app-user-avatar
            [userId]="conversation.other_user_id"
            [name]="conversation.other_name"
            [username]="conversation.other_username"
          />
          @if (presence(conversation.other_user_id); as p) {
            <span
              class="absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background"
              [class]="p.class"
              role="img"
              [attr.aria-label]="p.label"
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

      <!-- Per-room mute. The bell reflects the state and toggles it, so a noisy
           room can be silenced without leaving Do Not Disturb for everything. -->
      @if (roomId(); as id) {
        <button
          z-button
          zType="ghost"
          zSize="icon-sm"
          class="ml-auto shrink-0"
          [attr.aria-label]="notifications.isBlocked(id) ? 'Ativar notificações desta conversa' : 'Silenciar notificações desta conversa'"
          [attr.title]="notifications.isBlocked(id) ? 'Ativar notificações' : 'Silenciar notificações'"
          (click)="toggleNotifications(id)"
        >
          <ng-icon [name]="notifications.isBlocked(id) ? 'lucideBellOff' : 'lucideBell'" />
        </button>
      }
    </div>

    @if (loading()) {
      <!-- Bubble-shaped placeholders so the loading state already reads as a
           conversation, in a colour that stands off the muted content card. The
           width sits on a wrapper: z-skeleton applies its class input to an
           inner div, so as a flex item it has no width of its own and a
           percentage width on the inner div would resolve against zero. -->
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        @for (row of skeletonRows; track row) {
          <div class="flex w-full" [class.justify-end]="row % 3 === 0">
            <div [class]="row % 3 === 0 ? 'w-1/2' : 'w-2/3'">
              <z-skeleton class="h-10 w-full rounded-lg bg-bubble-received" />
            </div>
          </div>
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
              [class.bg-bubble-received]="!isOwn(row.message)"
              [class.border]="!isOwn(row.message)"
              [class.border-border]="!isOwn(row.message)"
            >
              @if (!isOwn(row.message)) {
                <p class="mb-0.5 text-xs text-muted-foreground">{{ authorName(row.message.author) }}</p>
              }

              @if (row.attachment; as attachment) {
                @if (isImageAttachment(attachment)) {
                  <!-- The image is fetched through the cache, which holds it on
                       disk for the retention the user chose; the skeleton covers
                       the moment before the object URL lands. -->
                  <div class="mb-1">
                    @if (resolvedImages()[attachment.path]; as url) {
                      <button
                        type="button"
                        class="block cursor-pointer"
                        [attr.aria-label]="'Ampliar ' + attachment.file_name"
                        [attr.title]="'Ampliar ' + attachment.file_name"
                        (click)="openPreview(attachment, url)"
                      >
                        <img
                          [src]="url"
                          [alt]="attachment.file_name"
                          class="max-h-64 w-full max-w-xs rounded-md object-cover"
                        />
                      </button>
                    } @else {
                      <z-skeleton class="h-40 w-52 rounded-md" />
                    }
                  </div>
                } @else {
                  <!-- Anything that is not a picture is downloaded on demand
                       through the cached blob URL, so the request still carries
                       the session token. The card is neutral on both bubble
                       colours. -->
                  <div class="mb-1">
                    <button
                      type="button"
                      class="flex max-w-xs cursor-pointer items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-2 text-sm text-foreground transition-opacity hover:opacity-80 disabled:cursor-progress disabled:opacity-60"
                      [disabled]="downloading()[attachment.path]"
                      [attr.aria-label]="'Baixar ' + attachment.file_name"
                      [attr.title]="'Baixar ' + attachment.file_name"
                      (click)="downloadAttachment(attachment)"
                    >
                      <ng-icon name="lucideFile" class="size-4 shrink-0 opacity-70" />
                      <span class="min-w-0 flex-1 truncate">{{ attachment.file_name }}</span>
                      <ng-icon
                        [name]="downloading()[attachment.path] ? 'lucideLoaderCircle' : 'lucideDownload'"
                        class="size-4 shrink-0 opacity-70"
                        [class.animate-spin]="downloading()[attachment.path]"
                      />
                    </button>
                  </div>
                }

                @if (attachment.message) {
                  <p class="wrap-break-word whitespace-pre-wrap">{{ attachment.message }}</p>
                }
              } @else {
                <p class="wrap-break-word whitespace-pre-wrap">
                  @for (segment of row.segments; track $index) {
                    @if (segment.type === 'mention') {
                      <button
                        type="button"
                        class="cursor-pointer rounded bg-mention px-1 font-medium text-mention-foreground transition-opacity hover:opacity-90"
                        [attr.title]="mentionTitle(segment.mention)"
                        (click)="openMention(segment.mention, $event)"
                      >{{ segment.value }}</button>
                    } @else if (segment.type === 'link') {
                      <a
                        [href]="segment.href"
                        class="underline underline-offset-2 hover:no-underline"
                        (click)="openLink(segment.href, $event)"
                      >{{ segment.value }}</a>
                    } @else {
                      <span>{{ segment.value }}</span>
                    }
                  }
                </p>
              }
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

    @if (pendingSend()) {
      <!-- The send failed because the socket is down or the batch request was
           rejected; the payload is parked here until a retry succeeds, so nothing
           the user typed or attached is lost. -->
      <div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 pt-2">
        <p class="flex-1 text-xs text-destructive">Não foi possível enviar — sem conexão com o servidor.</p>
        <button z-button zType="outline" zSize="sm" (click)="retry()">Tentar novamente</button>
      </div>
    }

    @if (typingLabel(); as label) {
      <p class="px-4 pt-2 text-xs text-muted-foreground">{{ label }}</p>
    }

    <chat-message-input [isDm]="!!dm()" (send)="send($event)" (typing)="onTyping($event)" />

    @if (previewImage(); as preview) {
      <chat-image-preview [url]="preview.url" [alt]="preview.name" (close)="closePreview()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHash, lucideBell, lucideBellOff, lucideFile, lucideDownload, lucideLoaderCircle })],
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
  private readonly externalLinks = inject(ExternalLinkService);
  private readonly fileService = inject(FileService);
  private readonly imageCache = inject(ImageCacheService);
  private readonly dialogService = inject(ZardDialogService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly notifications = inject(NotificationService);
  protected readonly mentions = inject(MentionService);
  protected readonly socket = inject(WebSocketService);

  protected readonly skeletonRows = [1, 2, 3, 4];

  /** Exposed for the template — a module-level function is not in its scope. */
  protected readonly isImageAttachment = isImageAttachment;

  protected readonly currentUserId = this.authService.getUserId();

  protected readonly roomId = toSignal(
    this.route.paramMap.pipe(map(params => params.get('id'))),
    { initialValue: null },
  );

  protected readonly messages = signal<MessageBroadcast[]>([]);
  protected readonly rooms = signal<RoomResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /**
   * A send that failed while the socket was down or the batch request was
   * rejected, awaiting a retry. The files are kept as `File` objects, so a retry
   * re-uploads them rather than losing the attachment.
   */
  protected readonly pendingSend = signal<OutgoingMessage | null>(null);

  /** Object URLs for the images on screen, keyed by their server path. */
  protected readonly resolvedImages = signal<Record<string, string>>({});
  private readonly requestedImages = new Set<string>();
  /** Cache revision the resolved image URLs belong to. */
  private imagesRevision = -1;

  /** Attachment paths whose save is in flight, so a second click is ignored. */
  protected readonly downloading = signal<Record<string, boolean>>({});

  /** The image open in the full-screen preview, if any. */
  protected readonly previewImage = signal<{ url: string; name: string } | null>(null);

  private typingRoomId: string | null = null;
  private typingSentAt = 0;
  private typingStopTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Names of the other participants currently typing in this room. */
  protected readonly typingUsers = computed(() => {
    const roomId = this.roomId();
    if (!roomId) {
      return [];
    }

    return this.socket
      .typing()
      .filter(event => event.room_id === roomId && event.author !== this.currentUserId)
      .map(event => this.userService.displayName(event.author));
  });

  protected readonly typingLabel = computed(() => {
    const names = this.typingUsers();
    if (names.length === 0) {
      return null;
    }
    if (names.length === 1) {
      return `${names[0]} está digitando...`;
    }
    if (names.length === 2) {
      return `${names[0]} e ${names[1]} estão digitando...`;
    }
    return `${names[0]} e mais ${names.length - 1} estão digitando...`;
  });

  /**
   * A burst of messages sent close together reads as one moment, so the
   * timestamp is carried by the last of a run rather than repeated on each.
   */
  protected readonly messageRows = computed(() => {
    const messages = this.messages();

    return messages.map((message, index) => {
      const next = messages[index + 1];
      const gapToNext = next ? new Date(next.sentAt).getTime() - new Date(message.sentAt).getTime() : Infinity;

      const attachment = parseAttachment(message);

      return {
        message,
        showTime: gapToNext >= GROUP_GAP_MS,
        attachment,
        // A file message's content is JSON, not text, so only a plain message is
        // segmented for links and mentions.
        segments: attachment
          ? []
          : segmentMessage(
              message.content,
              username => this.userService.findByUsername(username),
              { allowAll: !this.dm() },
            ),
      };
    });
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopTyping());

    this.scrollWhenReady();

    // A file message carries a path, not the bytes. Each image is resolved
    // through the local cache once, and the template renders it when the object
    // URL lands; the cache keeps it on disk for the retention the user chose.
    // Other attachments are fetched on click, so opening a room never downloads
    // a large file nobody asked for.
    effect(() => {
      const revision = this.imageCache.revision();
      if (revision !== this.imagesRevision) {
        // Clearing the cache (or replacing a photo) revokes every URL handed
        // out so far; drop them and let the loop below resolve them again.
        this.imagesRevision = revision;
        this.requestedImages.clear();
        this.resolvedImages.set({});
      }

      for (const row of this.messageRows()) {
        const attachment = row.attachment;
        if (!attachment || !isImageAttachment(attachment) || this.requestedImages.has(attachment.path)) {
          continue;
        }

        this.requestedImages.add(attachment.path);
        void this.imageCache.resolve(attachment.path).then(url => {
          // A clear while this was in flight makes the URL stale; the next
          // effect run has already queued a fresh resolve.
          if (url && this.imageCache.revision() === revision) {
            this.resolvedImages.update(current => ({ ...current, [attachment.path]: url }));
          }
        });
      }
    });

    // The room on screen is read as it arrives, so its own messages are neither
    // counted as unread nor announced. Cleanup covers both a room change and the
    // component being destroyed.
    effect(onCleanup => {
      const roomId = this.roomId();
      this.notifications.setActiveRoom(roomId);
      // Opening the room reads its mentions too, so the badge clears with the
      // unread count rather than lingering until a reload.
      this.mentions.setActiveRoom(roomId);
      onCleanup(() => {
        this.notifications.setActiveRoom(null);
        this.mentions.setActiveRoom(null);
      });
    });

    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        filter((id): id is string => !!id),
        tap(() => this.stopTyping()),
        // The router reuses this component across room navigations, so the public
        // room list fetched at construction can predate a room created since.
        // Refetch it on every room change so a newly created room resolves its
        // name instead of falling back to "Conversa".
        tap(() => this.loadPublicRooms()),
        // A new room cancels the previous request and clears what was on screen.
        switchMap(roomId => {
          this.messages.set([]);
          this.error.set(null);
          // The pending payload belongs to the room it failed in; retrying it
          // from another room would send it to the wrong conversation.
          this.pendingSend.set(null);
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

        // Identity is by value, not by reference: a history reload replaces every
        // object, so a live message already present in the reloaded history would
        // otherwise be appended a second time and scramble the order.
        const seen = new Set(this.messages().map(messageKey));
        const additions: MessageBroadcast[] = [];

        for (const message of buffered) {
          if (message.room_id !== roomId) {
            continue;
          }

          const key = messageKey(message);
          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          additions.push(message);
        }

        if (additions.length > 0) {
          this.messages.update(current => [...current, ...additions]);
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
  }

  /**
   * Re-reads the public room list that backs the header title. Called on every
   * room change rather than once at construction: the router reuses this
   * component across room navigations, so a room created after this instance was
   * built would otherwise be missing and the header would fall back to
   * "Conversa".
   */
  private loadPublicRooms(): void {
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

  /** Confirms before handing the URL to the OS, so a stray click cannot launch it. */
  protected openLink(url: string, event: Event): void {
    event.preventDefault();
    this.externalLinks.confirmAndOpen(url);
  }

  /**
   * Opens the full-screen preview for an image the cache has already resolved.
   * The object URL is handed over as-is, so the preview shares the bytes already
   * on screen instead of fetching the picture a second time.
   */
  protected openPreview(attachment: FileAttachment, url: string): void {
    this.previewImage.set({ url, name: attachment.file_name });
  }

  protected closePreview(): void {
    this.previewImage.set(null);
  }

  /**
   * Saves a non-image attachment. The bytes are fetched through the cache
   * because the endpoint requires the session token; in the desktop shell the
   * save goes through the native dialog, while a browser tab falls back to an
   * anchor download.
   */
  protected downloadAttachment(attachment: FileAttachment): void {
    const path = attachment.path;
    if (this.downloading()[path]) {
      return;
    }

    this.downloading.update(current => ({ ...current, [path]: true }));

    void this.saveAttachment(attachment)
      .catch(error => console.error('Falha ao salvar anexo', error))
      .finally(() => {
        this.downloading.update(current => {
          const next = { ...current };
          delete next[path];
          return next;
        });
      });
  }

  private async saveAttachment(attachment: FileAttachment): Promise<void> {
    const blob = await this.imageCache.read(attachment.path);
    if (!blob) {
      return;
    }

    if (isTauri()) {
      const target = await save({ title: 'Salvar arquivo', defaultPath: attachment.file_name });
      if (!target) {
        return;
      }

      await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
      return;
    }

    // A browser tab has no native save dialog, so the anchor's download
    // attribute is the equivalent. The URL is revoked once the browser has
    // taken the blob.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.file_name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Opens the mention dialog. A user mention shows that person's profile; a group
   * mention would list its members (not implemented yet); `@all` and an
   * unresolvable user have no additional information, so the dialog opens empty.
   *
   * The dialog is imported on demand because `zContent` needs the component type
   * up front, which a `loadComponent` route cannot hand it.
   */
  protected async openMention(mention: Mention, event: Event): Promise<void> {
    event.preventDefault();

    const { MentionDialogComponent } = await import(
      '@/components/dialog/mention/mention-dialog.component'
    );

    this.dialogService.create<unknown, MentionDialogData>({
      zTitle: this.mentionTitle(mention),
      zContent: MentionDialogComponent,
      zData: { mention },
      zHideFooter: true,
      zWidth: '24rem',
    });
  }

  /** The dialog title: the person's name, the group, or a generic label. */
  protected mentionTitle(mention: Mention): string {
    if (mention.kind === 'user') {
      const user = mention.userId ? this.userService.getUserById(mention.userId) : undefined;
      return user?.name || user?.username || 'Perfil';
    }

    return mention.kind === 'group' ? 'Grupo' : 'Todos';
  }

  protected presence(userId: string): { class: string; label: string } | null {
    return this.userService.presence(userId);
  }

  protected toggleNotifications(roomId: string): void {
    this.notifications.toggleBlock(roomId);
  }

  /** Row identity for the virtual for-loop; index is stable for an append-only list. */
  protected trackRow(index: number): number {
    return index;
  }

  protected send(payload: OutgoingMessage): void {
    this.stopTyping();

    const roomId = this.roomId();
    if (!roomId) {
      return;
    }

    // Files cannot ride the socket, which carries text frames only, so a send
    // with attachments goes over the batch endpoint instead.
    if (payload.files.length > 0) {
      this.sendBatch(roomId, payload);
      return;
    }

    // A closed socket is the only failure path here — the composer already
    // rejects empty or oversized content. Park the payload instead of dropping
    // it; a second failure while still offline replaces it, so nothing typed is
    // lost.
    if (!this.socket.sendMessage(roomId, payload.content)) {
      this.pendingSend.set(payload);
      return;
    }

    this.pendingSend.set(null);

    // Sending re-attaches the viewport even if it had been scrolled up: the
    // point of sending is to see what you sent.
    this.intent.set('always');

    const message: MessageBroadcast = {
      room_id: roomId,
      author: this.currentUserId ?? '',
      content: payload.content,
      sentAt: new Date().toISOString(),
    };

    this.messages.update(current => [...current, message]);
  }

  /**
   * Uploads the staged files and sends them as one batch. A file cannot ride the
   * socket, which carries text frames only, so each is uploaded first and the
   * batch references it by id. The server excludes the sender from the socket
   * broadcast, so the response is what puts the batch on screen.
   */
  private sendBatch(roomId: string, payload: OutgoingMessage): void {
    forkJoin(payload.files.map(file => this.fileService.uploadRoomFile(roomId, file))).subscribe({
      next: uploads => {
        const messages: BatchMessageInput[] = uploads.map((upload, index) => ({
          // The composer's text rides on the first file only; the rest travel as
          // attachment-only messages.
          content: index === 0 ? payload.content : '',
          is_file: true,
          file_id: upload.id,
        }));

        this.roomService.sendBatch(roomId, messages).subscribe({
          next: sent => {
            this.pendingSend.set(null);
            this.intent.set('always');
            this.messages.update(current => [...current, ...sent]);
          },
          error: () => this.pendingSend.set(payload),
        });
      },
      error: () => this.pendingSend.set(payload),
    });
  }

  protected retry(): void {
    const pending = this.pendingSend();
    if (pending) {
      this.send(pending);
    }
  }

  /**
   * Relays the local typing state. A "started" frame is sent on the first
   * keystroke and refreshed while the user keeps typing, so the receiver's
   * timeout cannot expire mid-sentence; a "stopped" frame follows a short idle
   * pause. The room is captured when the frame is sent, so a room change cannot
   * clear the wrong conversation.
   */
  protected onTyping(value: string): void {
    const roomId = this.roomId();
    if (!roomId) {
      return;
    }

    if (!value.trim()) {
      this.stopTyping();
      return;
    }

    const now = Date.now();
    if (this.typingRoomId !== roomId || now - this.typingSentAt >= TYPING_REFRESH_MS) {
      this.socket.sendTyping(roomId, true);
      this.typingRoomId = roomId;
      this.typingSentAt = now;
    }

    if (this.typingStopTimer !== null) {
      clearTimeout(this.typingStopTimer);
    }
    this.typingStopTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  private stopTyping(): void {
    if (this.typingStopTimer !== null) {
      clearTimeout(this.typingStopTimer);
      this.typingStopTimer = null;
    }

    if (this.typingRoomId === null) {
      return;
    }

    this.socket.sendTyping(this.typingRoomId, false);
    this.typingRoomId = null;
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
