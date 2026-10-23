import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type { ClassValue } from 'clsx';

import { ZardAvatarComponent } from '@/shared/components/avatar/avatar.component';
import type { ZardAvatarSizeVariants } from '@/shared/components/avatar/avatar.variants';
import { initials as toInitials } from '@/shared/utils/initials';
import { mergeClasses } from '@/shared/utils/merge-classes';

import { ImageCacheService } from '@/services/image-cache.service';

/** The avatar's dimensions, mirroring the z-avatar sizes for the photo branch. */
const PHOTO_SIZE_CLASSES: Record<ZardAvatarSizeVariants, string> = {
  sm: 'size-6',
  default: 'size-8',
  lg: 'size-10',
};

/**
 * Avatar for any user in the directory, not just the signed-in one.
 *
 * A profile photo is fetched through `ImageCacheService` with the session token
 * and rendered from a blob URL, so it has to be a plain `<img>`: `z-avatar`
 * draws through `NgOptimizedImage`, which rejects blob URLs (NG02952). The
 * initials fallback still goes through `z-avatar`.
 *
 * The cache's `revision` is watched so a photo uploaded anywhere in the app
 * replaces the cached copy without a reload.
 */
@Component({
  selector: 'app-user-avatar',
  imports: [ZardAvatarComponent],
  host: {
    class: 'block shrink-0',
  },
  template: `
    @if (photoUrl(); as src) {
      <img [src]="src" [alt]="label()" [class]="imageClasses()" />
    } @else {
      <z-avatar [zSize]="size()" [zFallback]="initials()" [class]="zClass()" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  private readonly imageCache = inject(ImageCacheService);

  readonly userId = input.required<string>();
  readonly name = input<string | null | undefined>(null);
  readonly username = input<string | null | undefined>(null);
  readonly size = input<ZardAvatarSizeVariants>('sm');
  /** Extra classes for the avatar, forwarded to both the photo and the fallback. */
  readonly zClass = input<ClassValue>('');

  protected readonly photoUrl = signal<string | null>(null);

  protected readonly label = computed(() => this.name() || this.username() || '');

  protected readonly initials = computed(() => toInitials(this.label()));

  protected readonly imageClasses = computed(() =>
    mergeClasses(
      'rounded-full object-cover ring-1 ring-border',
      PHOTO_SIZE_CLASSES[this.size()],
      this.zClass(),
    ),
  );

  constructor() {
    effect(() => {
      const revision = this.imageCache.revision();
      const userId = this.userId();

      this.photoUrl.set(null);
      if (!userId) {
        return;
      }

      void this.imageCache
        .resolve(`/files/users/${userId}.jpg`)
        .then(url => {
          // The resolve is asynchronous: a user or cache change in the meantime
          // makes this answer stale, and a revoked object URL would render as a
          // broken image.
          if (this.userId() === userId && this.imageCache.revision() === revision) {
            this.photoUrl.set(url);
          }
        })
        // A failed fetch (an offline backend, a user with no photo) is the
        // fallback's job; it must not surface as an unhandled rejection.
        .catch(() => undefined);
    });
  }
}
