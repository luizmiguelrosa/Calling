import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideUserRoundSearch } from '@ng-icons/lucide';
import { finalize } from 'rxjs';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardInputComponent } from '@/shared/components/input/input.component';
import { ZardInputGroupImports } from '@/shared/components/input-group';
import { ZardSkeletonComponent } from '@/shared/components/skeleton/skeleton.component';
import { initials as toInitials } from '@/shared/utils/initials';

import { AuthService } from '@/services/auth.service';
import { ConversationService } from '@/services/conversation.service';
import { UserService } from '@/services/user.service';

/**
 * Body of the "Nova conversa" dialog: search the directory, pick a person, and a
 * DM room is created for them. The directory is fetched once on open — the
 * search filters client-side, so typing costs no round trip.
 */
@Component({
  selector: 'app-new-conversation-dialog',
  imports: [
    NgIcon,
    ZardAvatarComponent,
    ZardEmptyComponent,
    ZardInputComponent,
    ZardInputGroupImports,
    ZardSkeletonComponent,
  ],
  template: `
    <z-input-group class="rounded-full">
      <div z-input-group-addon>
        <ng-icon name="lucideSearch" class="size-4" />
      </div>
      <input
        z-input
        type="search"
        placeholder="Buscar usuário..."
        aria-label="Buscar usuário"
        [value]="query()"
        (input)="onSearch($event)"
      />
    </z-input-group>

    <div class="mt-3 max-h-72 overflow-auto">
      @if (loading()) {
        @for (row of skeletonRows; track row) {
          <z-skeleton class="mb-1 h-10 w-full" />
        }
      } @else if (error(); as errorMessage) {
        <z-empty zIcon="lucideUserRoundSearch" zTitle="Não foi possível carregar" [zDescription]="errorMessage" />
      } @else if (filteredUsers().length === 0) {
        <z-empty
          zIcon="lucideUserRoundSearch"
          zTitle="Nenhum usuário"
          [zDescription]="query() ? 'Nada encontrado para essa busca.' : 'Nenhum usuário cadastrado.'"
        />
      } @else {
        <ul class="flex flex-col gap-1">
          @for (user of filteredUsers(); track user.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                [disabled]="creating() !== null"
                (click)="select(user)"
              >
                <span class="relative shrink-0">
                  <z-avatar zSize="sm" [zFallback]="initials(user.name || user.username)" />
                  @if (isOnline(user.id)) {
                    <span
                      class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-online ring-2 ring-popover"
                      role="img"
                      aria-label="Online"
                    ></span>
                  }
                </span>
                <span class="truncate">{{ user.name || user.username }}</span>
                <span class="ml-auto shrink-0 truncate text-xs text-muted-foreground">{{ user.username }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideSearch, lucideUserRoundSearch })],
})
export class NewConversationDialogComponent {
  private readonly userService = inject(UserService);
  private readonly conversations = inject(ConversationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialogRef = inject(ZardDialogRef<unknown, DMRoomResponse>);

  protected readonly skeletonRows = [1, 2, 3, 4];

  /** Exposed for the template — an imported function is not in its scope. */
  protected readonly initials = toInitials;

  protected readonly users = signal<UserResponse[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal<string | null>(null);

  protected readonly filteredUsers = computed(() => {
    // The signed-in user cannot start a DM with themselves, so they are dropped
    // from the directory before the term is applied.
    const currentId = this.authService.getUserId();
    const others = this.users().filter(user => user.id !== currentId);

    const term = this.query().trim().toLowerCase();
    if (!term) {
      return others;
    }

    return others.filter(
      user =>
        user.username.toLowerCase().includes(term) || user.name.toLowerCase().includes(term),
    );
  });

  constructor() {
    this.userService
      .getUsers()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: users => this.users.set(users),
        error: () => this.error.set('Tente novamente em instantes.'),
      });

    this.userService.loadOnline();
  }

  protected isOnline(userId: string): boolean {
    return this.userService.isOnline(userId);
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected select(user: UserResponse): void {
    this.creating.set(user.id);

    this.conversations
      .openDirectMessage(user)
      .pipe(finalize(() => this.creating.set(null)))
      .subscribe({
        next: room => {
          this.dialogRef.close(room);
          this.router.navigate(['/chat/room', room.id]);
        },
        error: (err: unknown) => this.error.set(this.describe(err)),
      });
  }

  /** Surfaces the status code so a 401/409/500 is distinguishable in the UI. */
  private describe(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    return status
      ? `Falha ao iniciar a conversa (HTTP ${status}).`
      : 'Não foi possível iniciar a conversa.';
  }
}