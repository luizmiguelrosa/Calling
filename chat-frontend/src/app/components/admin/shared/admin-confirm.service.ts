import { Injectable, inject } from '@angular/core';

import { ZardDialogService } from '@/shared/components/dialog/dialog.service';

/**
 * Confirmation for a destructive admin action. The callback runs from the
 * dialog's OK handler, so the dialog closes only after the user confirmed.
 */
@Injectable({ providedIn: 'root' })
export class AdminConfirmService {
  private readonly dialogService = inject(ZardDialogService);

  confirm(options: {
    title: string;
    description: string;
    okText?: string;
    onConfirm: () => void;
  }): void {
    this.dialogService.create({
      zTitle: options.title,
      zDescription: options.description,
      zOkText: options.okText ?? 'Excluir',
      zCancelText: 'Cancelar',
      zOkDestructive: true,
      zOnOk: () => {
        options.onConfirm();
      },
    });
  }
}