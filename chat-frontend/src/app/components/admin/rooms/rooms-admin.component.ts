import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { provideIcons } from '@ng-icons/core';
import { lucideHash } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardDialogService } from '@/shared/components/dialog/dialog.service';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { ZardEmptyComponent } from '@/shared/components/empty/empty.component';
import { ZardTableImports } from '@/shared/components/table';

import { AdminService } from '@/services/admin.service';
import { PermissionService } from '@/services/permission.service';

import type { RoomAdminDialogData } from './room-admin-dialog.component';

/**
 * Rooms category: create public rooms, rename them, and edit their per-room
 * permissions. Creation lives here rather than beside the chat's room list so
 * the option is shown only to a role holding `rooms.create`.
 */
@Component({
  selector: 'admin-rooms',
  standalone: true,
  imports: [ZardButtonComponent, ZardEmptyComponent, ...ZardTableImports],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div class="flex items-center gap-3">
        <div>
          <h2 class="text-lg font-semibold">Salas</h2>
          <p class="text-sm text-muted-foreground">
            Crie e renomeie salas públicas e defina quem pode ver ou enviar.
          </p>
        </div>

        @if (canCreate()) {
          <button z-button class="ml-auto" type="button" (click)="openCreate()">Nova sala</button>
        }
      </div>

      @if (loading()) {
        <p class="text-sm text-muted-foreground">Carregando salas...</p>
      } @else if (error(); as message) {
        <z-empty zIcon="lucideHash" zTitle="Não foi possível carregar" [zDescription]="message" />
      } @else if (rooms().length === 0) {
        <z-empty zIcon="lucideHash" zTitle="Nenhuma sala" zDescription="Nenhuma sala pública cadastrada." />
      } @else {
        <div class="overflow-x-auto rounded-lg border">
          <table z-table zSize="compact">
            <thead z-table-header>
              <tr z-table-row>
                <th z-table-head>Nome</th>
                <th z-table-head class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody z-table-body>
              @for (room of rooms(); track room.id) {
                <tr z-table-row>
                  <td z-table-cell class="font-medium">#{{ room.name }}</td>
                  <td z-table-cell class="text-right">
                    @if (canView()) {
                      <button z-button zType="outline" zSize="sm" type="button" (click)="open(room)">
                        Editar e permissões
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideIcons({ lucideHash })],
})
export class RoomsAdminComponent {
  private readonly adminService = inject(AdminService);
  private readonly permissions = inject(PermissionService);
  private readonly dialogService = inject(ZardDialogService);

  /** `rooms.view`/`rooms.edit` open the editor; `rooms.create` only creates. */
  protected readonly canView = computed(() => this.permissions.canAny('rooms.view', 'rooms.edit'));
  protected readonly canCreate = computed(() => this.permissions.can('rooms.create'));

  protected readonly rooms = signal<AdminRoom[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly roomDialog = signal<ZardDialogRef<unknown> | null>(null);
  private readonly createDialog = signal<ZardDialogRef<unknown> | null>(null);

  constructor() {
    this.reload();

    effect(() => {
      const room = this.roomDialog()?.result() as AdminRoom | undefined;
      if (!room) {
        return;
      }
      untracked(() => this.roomDialog.set(null));
      this.reload();
    });

    effect(() => {
      const created = this.createDialog()?.result() as RoomResponse | undefined;
      if (!created) {
        return;
      }
      untracked(() => this.createDialog.set(null));
      this.reload();
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.adminService.listRooms().subscribe({
      next: rooms => {
        this.rooms.set(rooms);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Verifique suas permissões e tente novamente.');
      },
    });
  }

  protected async openCreate(): Promise<void> {
    const { NewRoomDialogComponent } = await import('./new-room-dialog.component');

    this.createDialog.set(
      this.dialogService.create<unknown, RoomResponse>({
        zTitle: 'Criar sala',
        zContent: NewRoomDialogComponent,
        zHideFooter: true,
        zWidth: '26rem',
        // The vendored `sm:max-w-sm` cap would otherwise win over `zWidth`.
        zCustomClasses: 'sm:max-w-md',
      }),
    );
  }

  protected async open(room: AdminRoom): Promise<void> {
    if (!this.canView()) {
      return;
    }

    const { RoomAdminDialogComponent } = await import('./room-admin-dialog.component');

    this.roomDialog.set(
      this.dialogService.create<unknown, RoomAdminDialogData>({
        zTitle: `Sala #${room.name}`,
        zContent: RoomAdminDialogComponent,
        zData: { room },
        zHideFooter: true,
        zWidth: '32rem',
        zCustomClasses: 'sm:max-w-xl',
      }),
    );
  }
}