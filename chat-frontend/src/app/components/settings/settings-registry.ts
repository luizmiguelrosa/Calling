import { inject, type Injector } from '@angular/core';
import { tap, type Observable } from 'rxjs';

import { AuthService } from '@/services/auth.service';
import { FileService } from '@/services/file.service';
import { CACHE_TTL_OPTIONS, ImageCacheService } from '@/services/image-cache.service';
import { StartupService, type StartupMode } from '@/services/startup.service';
import { ThemeService } from '@/services/theme.service';

/** One selectable value of a `choice` setting. */
export interface SettingOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

/** Fields every setting shares, whatever control it renders. */
interface SettingControlBase {
  readonly label: string;
  readonly description: string;
  /** Extra terms the search should match, beyond the label. */
  readonly keywords?: readonly string[];
}

/** An on/off setting, rendered as a switch. */
export interface SwitchSettingControl extends SettingControlBase {
  readonly render: 'switch';
  readonly read: () => boolean;
  readonly write: (value: boolean) => void;
}

/** A setting with a fixed set of values, rendered as a radio group. */
export interface ChoiceSettingControl extends SettingControlBase {
  readonly render: 'choice';
  readonly options: readonly SettingOption[];
  readonly read: () => string;
  readonly write: (value: string) => void;
}

/** A read-only view of the image cache, rendered as a usage bar with a clear action. */
export interface CacheSettingControl extends SettingControlBase {
  readonly render: 'cache';
}

/** An upload control, rendered as a file picker. */
export interface FileSettingControl extends SettingControlBase {
  readonly render: 'file';
  readonly accept: string;
  readonly upload: (file: File) => Observable<unknown>;
}

/**
 * The shape every setting implements. Keeping the control behind this union
 * means the dialog renders settings generically — adding one is a data change,
 * not a template change.
 */
export type SettingControl =
  | SwitchSettingControl
  | ChoiceSettingControl
  | CacheSettingControl
  | FileSettingControl;

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
 * `injector` rather than a direct service field: this module is evaluated once
 * at import time, outside any injection context, so the dependencies are
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
            render: 'switch',
            label: 'Modo escuro',
            description:
              'Usa o tema escuro. Sem uma escolha explícita, segue a preferência do sistema.',
            keywords: ['dark', 'escuro', 'tema', 'theme', 'noite', 'night'],
            read: () => injector.get(ThemeService).isDark(),
            write: value => injector.get(ThemeService).setDark(value),
          },
        ],
      },
    ],
  };
}

function startupSettings(injector: Injector): SettingCategory {
  return {
    id: 'startup',
    label: 'Inicialização',
    icon: 'lucideRocket',
    groups: [
      {
        id: 'behavior',
        label: 'Comportamento ao iniciar',
        description: 'O que o aplicativo abre quando é iniciado.',
        settings: [
          {
            render: 'choice',
            label: 'Ao iniciar',
            description: 'Escolha a tela que o aplicativo abre em cada inicialização.',
            keywords: [
              'startup',
              'início',
              'inicialização',
              'abrir',
              'open',
              'última',
              'last',
              'home',
              'tela inicial',
            ],
            options: [
              {
                value: 'last',
                label: 'Abrir a última janela',
                description: 'Retoma a última conversa aberta antes de fechar.',
              },
              {
                value: 'home',
                label: 'Abrir na tela inicial',
                description: 'Começa sempre na tela inicial.',
              },
            ],
            read: () => injector.get(StartupService).mode(),
            write: value => injector.get(StartupService).setMode(value as StartupMode),
          },
        ],
      },
    ],
  };
}

function profileSettings(injector: Injector): SettingCategory {
  return {
    id: 'profile',
    label: 'Perfil',
    icon: 'lucideUserRound',
    groups: [
      {
        id: 'photo',
        label: 'Foto de perfil',
        description: 'A imagem que os outros participantes veem ao lado do seu nome.',
        settings: [
          {
            render: 'file',
            label: 'Foto de perfil',
            description:
              'A imagem é convertida para JPG, redimensionada e comprimida antes de ser guardada.',
            keywords: ['avatar', 'foto', 'perfil', 'imagem', 'photo', 'profile'],
            accept: 'image/*',
            upload: file =>
              injector
                .get(FileService)
                .uploadProfilePhoto(file)
                .pipe(
                  tap(() => {
                    const userId = injector.get(AuthService).getUserId();
                    if (userId) {
                      // The path is stable, so the cached copy has to be dropped
                      // or the old picture would keep showing until it expired.
                      void injector.get(ImageCacheService).invalidate(`/files/users/${userId}.jpg`);
                    }
                  }),
                ),
          },
        ],
      },
    ],
  };
}

function cacheSettings(injector: Injector): SettingCategory {
  return {
    id: 'cache',
    label: 'Cache',
    icon: 'lucideHardDrive',
    groups: [
      {
        id: 'images',
        label: 'Imagens',
        description:
          'Imagens baixadas ficam guardadas nesta máquina para não serem baixadas de novo.',
        settings: [
          {
            render: 'choice',
            label: 'Tempo de retenção',
            description: 'Por quanto tempo uma imagem guardada continua válida.',
            keywords: ['cache', 'ttl', 'retenção', 'expiração', 'dias', 'days', 'limpar'],
            options: CACHE_TTL_OPTIONS.map(days => ({
              value: String(days),
              label: `${days} dias`,
            })),
            read: () => String(injector.get(ImageCacheService).ttlDays()),
            write: value => injector.get(ImageCacheService).setTtlDays(Number(value)),
          },
          {
            render: 'cache',
            label: 'Uso do cache',
            description: 'Espaço ocupado pelas imagens guardadas nesta máquina.',
            keywords: ['cache', 'uso', 'espaço', 'armazenamento', 'limpar', 'storage'],
          },
        ],
      },
    ],
  };
}

/** The registry, built once and shared. */
export function buildSettingsRegistry(injector: Injector): readonly SettingCategory[] {
  return [
    appearanceSettings(injector),
    startupSettings(injector),
    profileSettings(injector),
    cacheSettings(injector),
  ];
}
