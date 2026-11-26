import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePaperclip, lucideSend, lucideUsers, lucideX } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardTextareaComponent } from '@/shared/components/textarea/textarea.component';
import { activeMentionQuery, type MentionQuery } from '@/shared/utils/mentions';

import { UserAvatarComponent } from '@/components/shared/user-avatar/user-avatar.component';

import { AuthService } from '@/services/auth.service';
import { UserService } from '@/services/user.service';
import type { ReplyReference } from '@/types/message.type';

/** A file staged for sending, with the bits its card needs to render. */
interface StagedFile {
  /** Stable identity for the `@for` track, so removing one does not shuffle the rest. */
  id: number;
  file: File;
  /** Object URL for an image, so the card can show a preview; null otherwise. */
  previewUrl: string | null;
  /** Uppercased extension for the format label, e.g. PDF, JS, TXT, CSV. */
  label: string;
}

/** What the composer hands to the room when the user sends. */
export interface OutgoingMessage {
  content: string;
  files: File[];
  /** The message this one quotes, if the user chose Reply. */
  replyToId?: number | null;
}

/** A row in the mention autocomplete. */
interface MentionOption {
  /** The token inserted after `@`. */
  token: string;
  label: string;
  detail: string;
  kind: MentionKind;
  /** The mentioned user, or null for the `@all` and group rows. */
  userId: string | null;
}

/** How many autocomplete rows are offered at once. */
const MAX_MENTION_OPTIONS = 8;

function formatLabel(file: File): string {
  const extension = file.name.split('.').pop()?.toUpperCase() ?? '';
  const subtype = file.type.split('/')[1]?.toUpperCase() ?? '';
  return extension || subtype || 'FILE';
}

@Component({
  selector: 'chat-message-input',
  standalone: true,
  imports: [NgIcon, ZardButtonComponent, ZardTextareaComponent, UserAvatarComponent],
  host: {
    '(paste)': 'onPaste($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    '[class.ring-2]': 'dragging()',
    '[class.ring-inset]': 'dragging()',
    '[class.ring-primary]': 'dragging()',
  },
  template: `
    <div class="flex flex-col gap-2">
      @if (replyTo(); as reply) {
        <div class="flex items-center gap-2 rounded-md bg-muted p-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-muted-foreground">Respondendo a</span>
            <span class="truncate text-sm">{{ quoteAuthor(reply) }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ quoteText(reply) }}</span>
          </div>
          <button z-button zType="ghost" zSize="icon-sm" (click)="cancelReply.emit()">
            <ng-icon name="lucideX" class="size-4" />
          </button>
        </div>
      }

      @if (files().length > 0) {
        <ul class="flex flex-wrap gap-2">
          @for (file of files(); track file.id) {
            <li class="flex items-center gap-2 rounded-md bg-muted p-1.5">
              <button z-button zType="ghost" zSize="icon-sm" (click)="removeFile(file.id)">
                <ng-icon name="lucideX" class="size-4" />
              </button>
              @if (file.previewUrl; as url) {
                <div class="relative size-12 shrink-0 rounded overflow-hidden">
                  <img [src]="url" [alt]="file.label" class="size-full object-cover" />
                </div>
              } @else {
                <span class="flex size-12 shrink-0 items-center justify-center rounded bg-muted/50 text-xs font-medium text-muted-foreground">
                  {{ file.label }}
                </span>
              }
              <span class="truncate text-sm">{{ file.file.name }}</span>
            </li>
          }
        </ul>
      }

      <div class="relative flex-1">
        <!-- Anchored to the field's own box so the list opens directly above it. -->
        @if (mentionQuery() && mentionOptions().length > 0) {
          <ul
            class="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-72 overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
            role="listbox"
            aria-label="Menções"
          >
            @for (option of mentionOptions(); track option.token; let i = $index) {
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  [attr.aria-selected]="i === selectedIndex()"
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  [class.bg-accent]="i === selectedIndex()"
                  [class.text-accent-foreground]="i === selectedIndex()"
                  (mousedown)="selectMention(option, $event)"
                >
                  @if (option.userId; as userId) {
                    <app-user-avatar [userId]="userId" [name]="option.label" />
                  } @else {
                    <span
                      class="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                    >
                      <ng-icon name="lucideUsers" class="size-3.5" />
                    </span>
                  }
                  <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                  <span class="shrink-0 truncate text-xs text-muted-foreground">{{ option.detail }}</span>
                </button>
              </li>
            }
          </ul>
        }

        <input
          type="hidden"
          [value]="value()"
          (input)="onInput($event)"
        />

        <button
          z-button
          zType="ghost"
          zSize="icon-sm"
          class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          (click)="openPicker()"
          aria-label="Anexar arquivo"
        >
          <ng-icon name="lucidePaperclip" class="size-5" />
        </button>

        <div class="relative flex-1">
          <textarea
            z-textarea
            #field
            class="w-full min-h-[48px] max-h-64 pr-12"
            [value]="value()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
            (keyup)="onCaretMove()"
            (click)="onCaretMove()"
            placeholder="Mensagem"
            aria-label="Mensagem"
            [disabled]="disabled()"
          ></textarea>

          <button
            z-button
            zType="ghost"
            zSize="icon-sm"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            [disabled]="!canSend()"
            (click)="submit()"
            aria-label="Enviar"
          >
            <ng-icon name="lucideSend" class="size-5" />
          </button>
        </div>
      </div>

      @if (overLimit()) {
        <p class="text-xs text-destructive">A mensagem excede o limite de 500 caracteres.</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucidePaperclip, lucideSend, lucideUsers, lucideX })],
})
export class MessageInputComponent implements OnDestroy {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  readonly disabled = input(false);
  readonly isDm = input(false);
  readonly replyTo = input<ReplyReference | null>(null);
  readonly send = output<OutgoingMessage>();
  readonly typing = output<boolean>();
  readonly cancelReply = output<void>();

  protected readonly value = signal('');
  protected readonly files = signal<StagedFile[]>([]);
  protected readonly dragging = signal(false);
  protected readonly mentionQuery = signal<MentionQuery | null>(null);
  protected readonly selectedIndex = signal(0);
  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  private nextFileId = 0;
  protected readonly overLimit = computed(() => this.value().length > 500);
  protected readonly canSend = computed(() => this.value().trim().length > 0 && !this.overLimit() && !this.disabled());

  /**
   * The rows offered for the current query. `@all` comes first and is a candidate
   * while the term is a prefix of it, so a bare `@` lists it alongside the
   * people; a group is offered as `@group:<name>`; everyone else is matched on
   * username or display name. A direct message has no audience for `@all`, so it
   * is left out there.
   */
  protected readonly mentionOptions = computed<MentionOption[]>(() => {
    const query = this.mentionQuery();
    if (!query) {
      return [];
    }

    const term = query.query.toLowerCase();
    const currentUserId = this.authService.getUserId();
    const options: MentionOption[] = [];

    if (!this.isDm() && 'all'.includes(term)) {
      options.push({ token: 'all', label: 'Todos', detail: 'Mencionar todos', kind: 'all', userId: null });
    }

    for (const group of this.userService.groups()) {
      // A mention token cannot carry whitespace, so a group name with a space is
      // not offered: typing it would chip only the first word.
      if (!/^[A-Za-z0-9._-]+$/.test(group.name)) {
        continue;
      }

      const token = `group:${group.name}`;
      if (token.toLowerCase().includes(term)) {
        options.push({
          token,
          label: group.name,
          detail: 'Mencionar grupo',
          kind: 'group',
          userId: null,
        });
      }
    }

    for (const user of this.userService.users()) {
      // Mentioning yourself is what `@all` already covers, so it is left out.
      if (user.id === currentUserId) {
        continue;
      }

      if (user.username.toLowerCase().includes(term) || user.name.toLowerCase().includes(term)) {
        options.push({
          token: user.username,
          label: user.name || user.username,
          detail: `@${user.username}`,
          kind: 'user',
          userId: user.id,
        });
      }
    }

    return options.slice(0, MAX_MENTION_OPTIONS);
  });

  constructor() {
    // The directory backs the autocomplete. The room view loads it too, and
    // `loadOnce` makes the second call a no-op once it has landed.
    this.userService.loadOnce().subscribe({ error: () => undefined });
    this.userService.loadGroupsOnce().subscribe({ error: () => undefined });
  }

  ngOnDestroy(): void {
    if (this.picker()) {
      this.picker()!.nativeElement.remove();
    }
  }

  protected onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.value.set(textarea.value);
    this.refreshMentionQuery();
  }

  protected onCaretMove(): void {
    const textarea = this.field()?.nativeElement;
    if (!textarea) {
      return;
    }
    const caret = textarea.selectionStart;
    this.mentionQuery.set(activeMentionQuery(this.value(), caret));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.mentionOptions();
    const open = options.length > 0 && this.mentionQuery() !== null;

    if (!open) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.selectMention(options[this.selectedIndex()], event);
    } else if (event.key === 'Escape') {
      this.closeMentions();
    }
  }

  protected selectMention(option: MentionOption, event: MouseEvent | KeyboardEvent): void {
    event.preventDefault();

    const query = this.mentionQuery();
    if (!query) {
      return;
    }

    const value = this.value();
    const before = value.slice(0, query.start);
    const after = value.slice(query.end);
    const inserted = `@${option.token} `;
    const next = before + inserted + after;
    const caret = query.start + inserted.length;

    this.value.set(next);
    this.closeMentions();

    // Restore caret after the value update.
    afterNextRender(
      () => {
        const textarea = this.field()?.nativeElement;
        if (textarea) {
          textarea.setSelectionRange(caret, caret);
          textarea.focus();
        }
      },
      { injector: this.injector },
    );
  }

  protected closeMentions(): void {
    this.mentionQuery.set(null);
    this.selectedIndex.set(0);
  }

  protected quoteText(message: ReplyReference): string {
    if (message.is_file) {
      return 'Arquivo';
    }
    return message.content.slice(0, 60);
  }

  protected quoteAuthor(message: ReplyReference): string {
    return message.author ? 'Outro' : 'Você';
  }

  protected submit(): void {
    const content = this.value().trim();
    if (!content || this.overLimit()) {
      return;
    }

    this.send.emit({
      content,
      files: this.files().map(f => f.file),
      replyToId: this.replyTo()?.id ?? null,
    });

    this.value.set('');
    this.files.set([]);
    this.typing.emit(false);
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) {
      this.addFiles(files);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    this.addFiles(files);
  }

  protected openPicker(): void {
    this.picker()?.nativeElement.click();
  }

  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addFiles(Array.from(input.files));
    }
    input.value = '';
  }

  protected removeFile(id: number): void {
    const removed = this.files().find(f => f.id === id);
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    this.files.update(current => current.filter(f => f.id !== id));
  }

  private refreshMentionQuery(): void {
    const textarea = this.field()?.nativeElement;
    if (!textarea) {
      return;
    }
    const caret = textarea.selectionStart;
    this.mentionQuery.set(activeMentionQuery(this.value(), caret));
  }

  private moveSelection(delta: number): void {
    const count = this.mentionOptions().length;
    if (count === 0) {
      return;
    }
    this.selectedIndex.update(current => (current + delta + count) % count);
  }

  private addFiles(files: File[]): void {
    const staged = files.map(file => {
      const id = this.nextFileId++;
      let previewUrl: string | null = null;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      const label = formatLabel(file);
      return { id, file, previewUrl, label };
    });
    this.files.update(current => [...current, ...staged]);
  }

  private clearFiles(): void {
    for (const file of this.files()) {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    }
    this.files.set([]);
  }

  private releasePreviews(): void {
    for (const file of this.files()) {
      if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
    }
  }
}
