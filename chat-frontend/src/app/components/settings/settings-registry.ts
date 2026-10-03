import { inject, type Injector } from '@angular/core';

import { ThemeService } from '@/services/theme.service';

/**
 * The shape every setting implements. Keeping the control behind this interface
 * means the dialog renders settings generically — adding one is a data change,
 * not a template change.
 */
export interface SettingControl {
  readonly label: string;
  readonly description: string;
  /** Extra terms the search should match, beyond the label. */
  readonly keywords?: readonly string[];
  readonly render: 'switch';
  readonly read: () => boolean;
  readonly write: (value: boolean) => void;
}

/**
 * A group of related settings inside a category. The tree is categories →
 * groups → settings, so a category can hold several themed sections without the
 * dialog needing to know what any of them are.
 */
export interface SettingGroup {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly settings: readonly SettingControl[];
}

export interface SettingCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly groups: readonly SettingGroup[];
}

/**
 * Every setting in the app, as a tree.
 *
 * `injector` rather than a direct `ThemeService` field: this module is evaluated
 * once at import time, outside any injection context, so the dependency is
 * resolved lazily when a control is actually read or written.
 */
function appearanceSettings(injector: Injector): SettingCategory {
  return {
    id: 'appearance',
    label: 'Aparência',
    icon: 'lucidePalette',
    groups: [
      {
        id: 'theme',
        label: 'Tema',
        description: 'Como o aplicativo se apresenta nesta máquina.',
        settings: [
          {
            label: 'Modo escuro',
            description:
              'Usa o tema escuro. Sem uma escolha explícita, segue a preferência do sistema.',
            keywords: ['dark', 'escuro', 'tema', 'theme', 'noite', 'night'],
            render: 'switch',
            read: () => injector.get(ThemeService).isDark(),
            write: value => injector.get(ThemeService).setDark(value),
          },
        ],
      },
    ],
  };
}

/** The registry, built once and shared. */
export function buildSettingsRegistry(injector: Injector): readonly SettingCategory[] {
  return [appearanceSettings(injector)];
}