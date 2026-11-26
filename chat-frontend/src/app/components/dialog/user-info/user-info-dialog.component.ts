import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMessageSquarePlus } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { injectDialogData } from '@/shared/components/dialog/dialog.service';

import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

import { AuthService } from '@/services/auth.service';
import { ConversationService } from '@/services/conversation.service';
import { UserService } from '@/services/user.service';

/** The user a conversation view asked the profile dialog to show. */
export interface UserInfoDialogData {
  userId: string;
}

/**
 * Profile of a user mentioned by a message or shown in a chat header. The
 * "Send message" action reuses the same DM resolver as the private reply, so a
 * click opens the existing conversation instead of creating a second one.
 */
@Component({
  selector: 'app-user-info-dialog',
  standalone: true,
  imports: [NgIcon, ZardButtonComponent, UserAvatarComponent],
  template: `
    @if (user(); as profile) {
      <div class="flex items-center gap-3">
        <span class="relative shrink-0">
          <app-user-avatar
            size="lg"
            [userId]="profile.id"
            [name]="profile.name"
            [username]="profile.username"
          />
          @if (presence(profile.id); as p) {
            <span
              class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-popover"
              [class]="p.class"
              role="img"
              [attr.aria-label]="p.label"
            ></span>
          }
        </span>

        <div class="min-w-0">
          <p class="truncate text-base font-medium">{{ profile.name || profile.username }}</p>
          <p class="truncate text-sm text-muted-foreground">&#64;{{ profile.username }}</p>
        </div>
      </div>

      <dl class="mt-4 grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Grupos</dt>
        <dd>
          @if (profile.groups.length === 0) {
            <span class="text-muted-foreground">Sem grupo</span>
          } @else {
            <span class="flex flex-wrap gap-1">
              @for (group of profile.groups; track group.id) {
                <span
                  class="rounded-full px-2 py-0.5 text-xs text-white"
                  [style.background]="group.color"
                >
                  {{ group.name }}
                </span>
              }
            </span>
          }
        </dd>

        <dt class="text-muted-foreground">Cargo</dt>
        <dd>
          @if (profile.role) {
            <span
              class="rounded-full px-2 py-0.5 text-xs text-white"
              [style.background]="profile.role.color"
            >
              {{ profile.role.name }}
            </span>
          } @else {
            <span class="text-muted-foreground">Sem cargo</span>
          }
        </dd>

        <dt class="text-muted-foreground">Status</dt>
        <dd class="flex items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" [class]="presence(profile.id)?.class ?? 'bg-muted-foreground'"></span>
          {{ presence(profile.id)?.label ?? 'Offline' }}
        </dd>
      </dl>

      @if (profile.id !== currentUserId) {
        <button
          z-button
          type="button"
          class="mt-4 w-full gap-2"
          [zLoading]="creating()"
          [zDisabled]="creating()"
          (click)="sendMessage(profile)"
        >
          <ng-icon name="lucideMessageSquarePlus" />
          Enviar mensagem
        </button>
      }
    } @else {
      <!-- A removed (soft-deleted) user or one missing from the directory still
           has a stable id in history; the dialog says so instead of guessing. -->
      <p class="text-sm text-muted-foreground">Usuário desconhecido</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideMessageSquarePlus })],
})
export class UserInfoDialogComponent {
  private readonly data = injectDialogData<UserInfoDialogData>();
  private readonly userService = inject(UserService);
  private readonly conversations = inject(ConversationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialogRef = inject(ZardDialogRef<unknown, unknown>);

  protected readonly currentUserId = this.authService.getUserId();
  protected readonly creating = signal(false);

  protected readonly user = computed(() => this.userService.getUserById(this.data.userId) ?? null);

  constructor() {
    // A chat header can be opened before the directory has landed; the dialog
    // needs the user's name and role, so it requests it once.
    this.userService.loadOnce().subscribe({ error: () => undefined });
  }

  protected presence(userId: string): { class: string; label: string } | null {
    return this.userService.presence(userId);
  }

  protected sendMessage(user: UserResponse): void {
    this.creating.set(true);

    this.conversations.openDirectMessage(user).subscribe({
      next: room => {
        this.dialogRef.close();
        void this.router.navigate(['/chat/room', room.id]);
      },
      error: () => this.creating.set(false),
    });
  }
}