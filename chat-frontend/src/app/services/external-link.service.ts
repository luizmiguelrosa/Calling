import { Injectable, inject } from '@angular/core';

import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

import { ZardDialogService } from '@/shared/components/dialog/dialog.service';

/**
 * Opens links that leave the app. A message can carry any address, so the user
 * confirms before anything is handed to the OS — a stray click should not launch
 * a browser at an unknown destination.
 *
 * Inside the Tauri shell the URL goes through the opener plugin, which hands it
 * to the system's default browser. In a plain browser (`npm start`) there is no
 * plugin bridge, so a new tab is the equivalent.
 */
@Injectable({ providedIn: 'root' })
export class ExternalLinkService {
  private readonly dialog = inject(ZardDialogService);

  /** Asks for confirmation, then opens the URL in the default browser. */
  confirmAndOpen(url: string): void {
    this.dialog.create({
      zTitle: 'Abrir link externo?',
      zDescription: url,
      zOkText: 'Abrir',
      zCancelText: 'Cancelar',
      zOnOk: () => {
        void this.open(url);
      },
    });
  }

  private async open(url: string): Promise<void> {
    if (isTauri()) {
      try {
        await openUrl(url);
        return;
      } catch (err) {
        console.error('ExternalLinkService: could not open the URL', err);
      }
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
