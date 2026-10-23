import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { injectDialogData } from '@/shared/components/dialog/dialog.service';

import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

import { UserService } from '@/services/user.service';

/** What a mention click hands the dialog. */
export interface MentionDialogData {
  mention: Mention;
}

/**
 * Body of the mention dialog. A user mention resolves to a profile; `@all` lists
 * the room's users; a group mention would list its members (not implemented yet);
 * a user who has since left the directory carries no additional information, so
 * the dialog deliberately renders no content.
 */
@Component({
  selector: 'app-mention-dialog',
  imports: [UserAvatarComponent],
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

      <dl class="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Cargo</dt>
        <dd>{{ roleLabel(profile.role) }}</dd>

        <dt class="text-muted-foreground">Status</dt>
        <dd class="flex items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" [class]="presence(profile.id)?.class ?? 'bg-muted-foreground'"></span>
          {{ presence(profile.id)?.label ?? 'Offline' }}
        </dd>
      </dl>
    } @else if (mention.kind === 'all') {
      <!-- @all names everyone in the room, so the dialog lists them. A public
           room is open to the whole directory, which is the audience it reaches. -->
      <ul class="flex max-h-72 flex-col gap-1 overflow-auto">
        @for (member of users(); track member.id) {
          <li class="flex items-center gap-2 rounded-md p-1.5">
            <span class="relative shrink-0">
              <app-user-avatar [userId]="member.id" [name]="member.name" [username]="member.username" />
              @if (presence(member.id); as p) {
                <span
                  class="absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-popover"
                  [class]="p.class"
                  role="img"
                  [attr.aria-label]="p.label"
                ></span>
              }
            </span>
            <span class="min-w-0 flex-1 truncate text-sm">{{ member.name || member.username }}</span>
            <span class="shrink-0 truncate text-xs text-muted-foreground">{{ member.username }}</span>
          </li>
        }
      </ul>
    } @else if (mention.kind === 'group') {
      <!-- TODO: render the group's members here once groups exist. Until then a
           group mention has no additional information, so the body stays empty. -->
    } @else {
      <!-- A user who has left the directory carries no additional information, so
           the dialog opens with no content. -->
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentionDialogComponent {
  private readonly data = injectDialogData<MentionDialogData>();
  private readonly userService = inject(UserService);

  protected readonly mention = this.data.mention;

  /** The directory, listed for an `@all` mention. */
  protected readonly users = this.userService.users;

  /** The mentioned user, when the token resolved to one still in the directory. */
  protected readonly user = computed(() => {
    const id = this.mention.userId;
    return id ? this.userService.getUserById(id) ?? null : null;
  });

  constructor() {
    // The `@all` list is the directory. The room view loads it too, and
    // `loadOnce` makes the second call a no-op once it has landed.
    this.userService.loadOnce().subscribe({ error: () => undefined });
  }

  protected presence(userId: string): { class: string; label: string } | null {
    return this.userService.presence(userId);
  }

  protected roleLabel(role: UserResponse['role']): string {
    return role === 'Admin' ? 'Administrador' : 'Desenvolvedor';
  }
}
