import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHash, lucidePlus } from '@ng-icons/lucide';
import { filter, finalize, map } from 'rxjs';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardSkeletonComponent } from '@/shared/components/skeleton/skeleton.component';

import { RoomService } from '@/services/room.service';

/**
 * Rooms screen: the public room list on the left, the selected room's chat on
 * the right. The selected room is a child route, so opening one keeps the list
 * mounted instead of replacing it.
 */
@Component({
  selector: 'chat-room-list',
  standalone: true,
  imports: [NgIcon, RouterOutlet, ZardButtonComponent, ZardEmptyComponent, ZardSkeletonComponent],
  // A component host is an inline custom element by default, so it needs to be
  // told to stretch or the flex row below has nothing to fill.
  host: {
    class: 'flex min-h-0 flex-1',
  },
  template: `
    <div class="flex w-72 shrink-0 flex-col border-r">
      <div class="flex h-14 shrink-0 items-center gap-2 px-4">
        <h1 class="text-xl font-semibold">Início</h1>

        <button
          z-button
          zType="ghost"
          zSize="icon-sm"
          class="ml-auto"
          aria-label="Criar sala"
          title="Criar sala"
          (click)="createRoom()"
        >
          <ng-icon name="lucidePlus" />
        </button>
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
  viewProviders: [provideIcons({ lucideHash, lucidePlus })],
})
export class RoomListComponent {
  private readonly roomService = inject(RoomService);
  private readonly router = inject(Router);
  private readonly dialogService = inject(ZardDialogService);

  protected readonly skeletonRows = [1, 2, 3, 4];

  protected readonly rooms = signal<RoomResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * The open create dialog, if any. Held as a signal so the constructor effect can
   * watch its result. It cannot be read from the async `createRoom` directly: an
   * effect created after an `await` has no injection context and throws.
   *
   * `R` (the result) is left at its default. `create` returns `ZardDialogRef<T>`
   * and never propagates one, so the effect below casts instead; `T` is pinned to
   * `unknown` at the call site to match this declaration.
   */
    private readonly createDialog = signal<ZardDialogRef<unknown> | null>(null);

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

    effect(() => {
      // `create` returns `ZardDialogRef<T>` without the result type, so
      // `result()` is `unknown`; the dialog only ever closes with a
      // RoomResponse, so the cast is where that contract is stated.
      const room = this.createDialog()?.result() as RoomResponse | undefined;
      if (!room) {
        return;
      }

      // Drop the ref first so cancelling or a later creation is not re-handled.
      untracked(() => this.createDialog.set(null));

      // Refetch rather than patching the new room into the list: a public room
      // can also be created from another window, and only a refetch sees those.
      this.refreshRooms();

      this.open(room);
    });
  }

  /**
   * Re-reads the public room list. Called after a room is created rather than
   * splicing the response in, so a room created from another window shows up too.
   */
  private refreshRooms(): void {
    this.roomService
      .getPublicRooms()
      .subscribe({ next: rooms => this.rooms.set(rooms), error: () => undefined });
  }

  protected open(room: RoomResponse): void {
    this.router.navigate(['/chat/rooms', room.id]);
  }

  /**
   * Opens the create-room modal and, on success, opens the room it created.
   *
   * The dialog is imported on demand because `zContent` needs the component type
   * up front, which a `loadComponent` route cannot hand it — the same reason the
   * sidebar imports its "Nova conversa" dialog that way.
   */
  protected async createRoom(): Promise<void> {
    const { NewRoomDialogComponent } = await import(
      '@/components/dialog/new-room/new-room-dialog.component'
    );

    // Stored as a signal rather than acted on directly: the effect in the
    // constructor owns the result, so the refetch and navigation still happen
    // whether the dialog closes here or after a navigation away.
    this.createDialog.set(
      // The explicit generic pins T to unknown. Without it T is inferred as
      // NewRoomDialogComponent from zContent, and the returned ref no longer
      // matches the signal's declared type.
      this.dialogService.create<unknown, RoomResponse>({
        zTitle: 'Criar sala',
        zContent: NewRoomDialogComponent,
        zHideFooter: true,
        zWidth: '26rem',
        // The vendored `sm:max-w-sm` cap would otherwise win over `zWidth`.
        zCustomClasses: 'sm:max-w-md',
      }),
    );
  }
}