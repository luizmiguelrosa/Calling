import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Injector } from '@angular/core';

import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideSearch, lucideSearchX, lucideSettings } from '@ng-icons/lucide';

import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardInputComponent } from '@/shared/components/input/input.component';
import { ZardInputGroupImports } from '@/shared/components/input-group';
import { ZardSwitchComponent } from '@/shared/components/switch';

import {
  buildSettingsRegistry,
  type SettingCategory,
  type SettingControl,
  type SettingGroup,
} from '../settings-registry';

/**
 * Settings modal: categories on the left, the selected category's groups on the
 * right.
 *
 * Categories are a tree of groups, and the search walks that tree rather than a
 * flat list — a term can match a group label or a setting nested inside it, and
 * the category that owns it still has to surface. Searching therefore filters
 * the tree and jumps to the first category that still matches, rather than
 * leaving the right pane showing an unrelated category's settings.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [
    NgIcon,
    ZardEmptyComponent,
    ZardInputComponent,
    ZardInputGroupImports,
    ZardSwitchComponent,
  ],
  template: `
    <div class="flex h-[34rem] w-full flex-col">
      <div class="flex items-center gap-2 border-b px-4 py-3">
        <ng-icon name="lucideSettings" class="size-4 text-muted-foreground" />
        <h2 class="text-base font-semibold">Configurações</h2>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Categories -->
        <nav class="flex w-64 shrink-0 flex-col border-r" aria-label="Categorias de configuração">
          <div class="p-2">
            <z-input-group class="rounded-md">
              <div z-input-group-addon>
                <ng-icon name="lucideSearch" class="size-4" />
              </div>
              <input
                z-input
                type="search"
                placeholder="Buscar..."
                aria-label="Buscar configurações"
                [value]="query()"
                (input)="onSearch($event)"
              />
            </z-input-group>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-2 pt-0">
            @if (visibleCategories().length === 0) {
              <p class="px-2 py-1 text-xs text-muted-foreground">Nenhuma categoria.</p>
            } @else {
              <ul class="flex flex-col gap-1">
                @for (category of visibleCategories(); track category.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      [class.bg-accent]="selectedId() === category.id"
                      [class.text-accent-foreground]="selectedId() === category.id"
                      [attr.aria-current]="selectedId() === category.id ? 'true' : null"
                      (click)="select(category)"
                    >
                      <ng-icon [name]="category.icon" class="size-4 shrink-0 text-muted-foreground" />
                      <span class="truncate">{{ category.label }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        </nav>

        <!-- Settings of the selected category -->
        <div class="min-w-0 flex-1 overflow-auto p-4">
          @if (selected(); as category) {
            <h3 class="mb-1 text-sm font-semibold">{{ category.label }}</h3>

            @for (group of visibleGroups(category); track group.id) {
              <section class="mt-4">
                <div class="mb-2 flex items-center gap-1.5">
                  <ng-icon name="lucideChevronRight" class="size-3.5 text-muted-foreground" />
                  <h4 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {{ group.label }}
                  </h4>
                </div>

                @if (group.description) {
                  <p class="mb-2 pl-5 text-xs text-muted-foreground">{{ group.description }}</p>
                }

                <div class="flex flex-col divide-y">
                  @for (setting of visibleSettings(group); track setting.label) {
                    <div class="flex items-center justify-between gap-4 py-3">
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium">{{ setting.label }}</p>
                        <p class="mt-0.5 text-xs text-muted-foreground">{{ setting.description }}</p>
                      </div>

                      <z-switch
                        [zChecked]="setting.read()"
                        [zId]="setting.label"
                        (zCheckedChange)="setting.write($event)"
                      />
                    </div>
                  }
                </div>
              </section>
            }

            @if (countVisibleSettings(category) === 0) {
              <z-empty
                zIcon="lucideSearchX"
                zTitle="Nada encontrado"
                [zDescription]="'Nenhuma configuração corresponde a “' + query() + '”.'"
              />
            }
          } @else {
            <z-empty
              zIcon="lucideSettings"
              zTitle="Selecione uma categoria"
              zDescription="Escolha uma categoria à esquerda para ver suas configurações."
            />
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideSettings, lucideSearch, lucideSearchX, lucideChevronRight })],
})
export class SettingsDialogComponent {
  private readonly categories = buildSettingsRegistry(inject(Injector));

  protected readonly query = signal('');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly selected = computed(
    () => this.categories.find(category => category.id === this.selectedId()) ?? null,
  );

  /** Search narrows the tree; with no term the full set is shown. */
  protected readonly visibleCategories = computed(() => {
    const term = this.term();
    if (!term) {
      return this.categories;
    }

    return this.categories.filter(category => this.categoryMatches(category, term));
  });

  constructor() {
    this.selectedId.set(this.categories[0]?.id ?? null);
  }

  protected select(category: SettingCategory): void {
    this.selectedId.set(category.id);
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);

    // Land on the first category that still matches, so a search never leaves the
    // right pane showing an unrelated category's settings.
    const visible = this.visibleCategories();
    if (!visible.some(category => category.id === this.selectedId())) {
      this.selectedId.set(visible[0]?.id ?? null);
    }
  }

  protected visibleGroups(category: SettingCategory): readonly SettingGroup[] {
    const term = this.term();
    if (!term) {
      return category.groups;
    }

    return category.groups.filter(group => this.groupMatches(group, term));
  }

  protected visibleSettings(group: SettingGroup): readonly SettingControl[] {
    const term = this.term();
    if (!term) {
      return group.settings;
    }

    return group.settings.filter(setting => this.matches(settingText(setting), term));
  }

  protected countVisibleSettings(category: SettingCategory): number {
    return this.visibleGroups(category).reduce(
      (total, group) => total + this.visibleSettings(group).length,
      0,
    );
  }

  private categoryMatches(category: SettingCategory, term: string): boolean {
    // A category survives the filter if its own name matches, or if anything
    // inside it does — otherwise searching for "escuro" would hide the only
    // category that owns it.
    return (
      this.matches(category.label, term) ||
      category.groups.some(
        group =>
          this.matches(`${group.label} ${group.description ?? ''}`, term) ||
          group.settings.some(setting => this.matches(settingText(setting), term)),
      )
    );
  }

  private groupMatches(group: SettingGroup, term: string): boolean {
    return (
      this.matches(`${group.label} ${group.description ?? ''}`, term) ||
      group.settings.some(setting => this.matches(settingText(setting), term))
    );
  }

  private matches(haystack: string, term: string): boolean {
    return haystack.toLowerCase().includes(term);
  }

  private term(): string {
    return this.query().trim().toLowerCase();
  }
}

/** Label, description and the extra keywords, as one searchable string. */
function settingText(setting: SettingControl): string {
  return `${setting.label} ${setting.description} ${(setting.keywords ?? []).join(' ')}`;
}