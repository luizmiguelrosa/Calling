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
}

/** A row in the mention autocomplete. */
interface MentionOption {
  /** The token inserted after `@`. */
  token: string;
  label: string;
  detail: string;
  kind: MentionKind;
  /** The mentioned user, or null for the `@all` row. */
  userId: string | null;
}

/** How many autocomplete rows are offered at once. */
const MAX_MENTION_OPTIONS = 8;

/** The format label for a non-image card: the extension, or the MIME subtype. */
function formatLabel(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
  if (extension) {
    return extension.toUpperCase().slice(0, 8);
  }

  const subtype = file.type.split('/')[1];
  return subtype ? subtype.toUpperCase().slice(0, 8) : 'ARQUIVO';
}

/**
 * Composer at the foot of a conversation. Enter sends, Shift+Enter breaks the
 * line; the backend caps a message at 500 characters, so the counter is shown
 * only once the limit is in reach.
 *
 * Files are staged here and shown as a list above the input. They arrive by
 * paste, by drag and drop, or through the paperclip button, and the text typed
 * in the field is attached to the first file only — the rest travel as
 * attachment-only messages.
 *
 * Typing `@` opens an autocomplete above the field: a bare `@` lists everyone
 * plus `@all`, and each further character narrows the list. Arrow keys move the
 * highlight, Enter or Tab accepts, Escape dismisses.
 */
@Component({
  selector: 'chat-message-input',
  standalone: true,
  imports: [NgIcon, UserAvatarComponent, ZardButtonComponent, ZardTextareaComponent],
  host: {
    class: 'block shrink-0 border-t bg-background/60 p-3 sm:p-4',
    '(paste)': 'onPaste($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    '[class.ring-2]': 'dragging()',
    '[class.ring-inset]': 'dragging()',
    '[class.ring-primary]': 'dragging()',
  },
  template: `
    <div class="mx-auto w-full max-w-3xl">
      @if (files().length > 0) {
        <!-- The staged files sit above the input, each removable on its own. -->
        <ul class="mb-2 flex flex-wrap gap-2">
          @for (item of files(); track item.id) {
            <li class="relative flex w-24 flex-col overflow-hidden rounded-lg border bg-card">
              <button
                type="button"
                class="absolute top-1 right-1 z-10 grid size-5 place-items-center rounded-full bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
                [attr.aria-label]="'Remover ' + item.file.name"
                [attr.title]="'Remover ' + item.file.name"
                (click)="removeFile(item.id)"
              >
                <ng-icon name="lucideX" class="size-3" />
              </button>

              <div class="grid h-16 w-full place-items-center overflow-hidden bg-muted">
                @if (item.previewUrl) {
                  <img [src]="item.previewUrl" [alt]="item.file.name" class="size-full object-cover" />
                } @else {
                  <span class="text-xs font-semibold tracking-wide text-muted-foreground">{{ item.label }}</span>
                }
              </div>

              <span class="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{{ item.file.name }}</span>
            </li>
          }
        </ul>
      }

      <div class="flex items-end gap-2">
        <input #picker type="file" multiple hidden (change)="onFilesPicked($event)" />

        <button
          z-button
          zType="ghost"
          zSize="icon-lg"
          zShape="circle"
          class="mb-0.5 shrink-0"
          aria-label="Anexar arquivo"
          title="Anexar arquivo"
          (click)="openPicker()"
        >
          <ng-icon name="lucidePaperclip" />
        </button>

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

          <textarea
            #field
            z-textarea
            rows="1"
            placeholder="Escreva uma mensagem..."
            aria-label="Mensagem"
            class="max-h-32 min-h-11 w-full resize-none rounded-2xl py-2.5"
            [value]="value()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
            (keyup.arrowleft)="onCaretMove($event)"
            (keyup.arrowright)="onCaretMove($event)"
            (keyup.home)="onCaretMove($event)"
            (keyup.end)="onCaretMove($event)"
            (click)="onCaretMove($event)"
            (blur)="closeMentions()"
          ></textarea>
        </div>

        <button
          z-button
          zType="default"
          zSize="icon-lg"
          zShape="circle"
          class="mb-0.5 shrink-0"
          aria-label="Enviar"
          [zDisabled]="!canSend()"
          (click)="submit()"
        >
          <ng-icon name="lucideSend" />
        </button>
      </div>

      @if (value().length > 400) {
        <p
          class="mt-1.5 w-full text-right text-xs tabular-nums"
          [class.text-destructive]="overLimit()"
        >
          {{ value().length }}/500
        </p>
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
  /** A direct message has no audience for `@all`, so it is not offered there. */
  readonly isDm = input(false);

  readonly send = output<OutgoingMessage>();
  readonly typing = output<string>();

  protected readonly value = signal('');
  protected readonly files = signal<StagedFile[]>([]);
  protected readonly dragging = signal(false);

  /** The mention being typed at the caret, or null when none is open. */
  protected readonly mentionQuery = signal<MentionQuery | null>(null);
  /** The highlighted row of the mention list. */
  protected readonly selectedIndex = signal(0);

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private nextFileId = 0;

  protected readonly overLimit = () => this.value().length > 500;
  protected readonly canSend = () =>
    (this.value().trim().length > 0 || this.files().length > 0) && !this.overLimit() && !this.disabled();

  /**
   * The rows offered for the current query. `@all` comes first and is a candidate
   * while the term is a prefix of it, so a bare `@` lists it alongside the
   * people; everyone else is matched on username or display name. A direct
   * message has no audience for `@all`, so it is left out there.
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
  }

  ngOnDestroy(): void {
    this.releasePreviews();
  }

  protected onInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.value.set(textarea.value);
    this.refreshMentionQuery(textarea);
    this.typing.emit(textarea.value);
  }

  /** Re-reads the mention under the caret after the caret itself moved. */
  protected onCaretMove(event: Event): void {
    this.refreshMentionQuery(event.target as HTMLTextAreaElement);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.mentionOptions();
    const open = this.mentionQuery() !== null && options.length > 0;

    if (open) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.moveSelection(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          this.moveSelection(-1);
          return;
        case 'Enter':
        case 'Tab':
          event.preventDefault();
          this.selectMention(options[this.selectedIndex()] ?? options[0]);
          return;
        case 'Escape':
          event.preventDefault();
          this.closeMentions();
          return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  /**
   * Replaces the token under the caret with the chosen mention. The value is
   * written to the field directly as well as to the signal, so the caret can be
   * placed after the inserted token without waiting for the binding to land.
   */
  protected selectMention(option: MentionOption, event?: Event): void {
    // Keeps focus in the field: a plain click would blur it and close the list
    // before the selection is applied.
    event?.preventDefault();

    const query = this.mentionQuery();
    if (!query) {
      return;
    }

    const value = this.value();
    const before = value.slice(0, query.start);
    const after = value.slice(query.end);
    const inserted = `@${option.token} `;
    const next = `${before}${inserted}${after}`;

    this.value.set(next);
    this.closeMentions();
    this.typing.emit(next);

    const caret = before.length + inserted.length;
    afterNextRender(
      () => {
        const textarea = this.field().nativeElement;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      },
      { injector: this.injector },
    );
  }

  protected closeMentions(): void {
    this.mentionQuery.set(null);
  }

  protected submit(): void {
    if (!this.canSend()) {
      return;
    }

    this.send.emit({ content: this.value().trim(), files: this.files().map(item => item.file) });
    this.value.set('');
    this.closeMentions();
    this.clearFiles();
  }

  /** Ctrl+V: an image or file on the clipboard is staged instead of pasted as text. */
  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    this.addFiles(files);
  }

  protected onDragOver(event: DragEvent): void {
    // Only claim the drop when files are being dragged, so dragging selected
    // text into the textarea still behaves normally.
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    // dragleave also fires while moving between child elements; only clear the
    // highlight once the pointer has actually left the composer.
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as Node).contains(next)) {
      return;
    }

    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.addFiles(files);
    }
  }

  protected openPicker(): void {
    this.picker().nativeElement.click();
  }

  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    // Reset so picking the same file again still fires a change event.
    input.value = '';
  }

  protected removeFile(id: number): void {
    const removed = this.files().find(item => item.id === id);
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }

    this.files.update(current => current.filter(item => item.id !== id));
  }

  private refreshMentionQuery(textarea: HTMLTextAreaElement): void {
    const caret = textarea.selectionStart ?? textarea.value.length;
    this.mentionQuery.set(activeMentionQuery(textarea.value, caret));
    // A new query means a new list, so the highlight starts at the top.
    this.selectedIndex.set(0);
  }

  private moveSelection(delta: number): void {
    const count = this.mentionOptions().length;
    if (count === 0) {
      return;
    }

    this.selectedIndex.update(index => (index + delta + count) % count);
  }

  private addFiles(files: File[]): void {
    const staged = files.map(file => ({
      id: this.nextFileId++,
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      label: formatLabel(file),
    }));

    this.files.update(current => [...current, ...staged]);
  }

  private clearFiles(): void {
    this.releasePreviews();
    this.files.set([]);
  }

  private releasePreviews(): void {
    for (const item of this.files()) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  }
}
