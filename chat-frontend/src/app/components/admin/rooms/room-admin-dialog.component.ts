import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ZardBadgeComponent } from '@/shared/components/badge';
import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCheckboxComponent } from '@/shared/components/checkbox';
import { ZardDialogRef } from '@/shared/components/dialog/dialog-ref';
import { injectDialogData } from '@/shared/components/dialog/dialog.service';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';

import { describe } from '@/components/admin/users/user-admin-dialog.component';

import { AdminService } from '@/services/admin.service';
import { PermissionService } from '@/services/permission.service';

/** What the rooms category hands the room dialog. */
export interface RoomAdminDialogData {
  room: AdminRoom;
}

/**
 * Rename a public room and edit its per-room permissions. A permission can be
 * granted to one user or to a whole group; a group grant applies to every member
 * through `group_members`. A room with no explicit rows is open to every
 * authenticated user, so the first grant switches it to restricted access.
 */
@Component({
  selector: 'admin-room-dialog',
  standalone: true,
  imports: [
    FormsModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputComponent,
    ...ZardFieldImports,
  ],
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex items-end gap-2">
        <div z-field class="flex-1">
          <label z-field-label for="admin-room-name">Nome da sala</label>
          <input
            z-input
            id="admin-room-name"
            type="text"
            [value]="name()"
            (input)="name.set(valueOf($event))"
          />
        </div>
        <button z-button type="button" [zLoading]="savingName()" [zDisabled]="savingName() || !canEdit()" (click)="rename()">
          Renomear
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium">Permissões por usuário ou grupo</span>
          @if (openRoom()) {
            <z-badge zType="secondary">Acesso aberto</z-badge>
          } @else {
            <z-badge zType="default">Acesso restrito</z-badge>
          }
        </div>

        <p class="text-xs text-muted-foreground">
          @if (openRoom()) {
            Enquanto não houver permissões explícitas, todos os usuários podem ver e enviar mensagens. Marcar a
            primeira permissão restringe a sala às pessoas e grupos marcados.
          } @else {
            Somente as pessoas e grupos marcados abaixo podem ver e enviar mensagens nesta sala.
          }
        </p>

        @if (loadingPermissions()) {
          <p class="text-sm text-muted-foreground">Carregando permissões...</p>
        } @else {
          <div class="flex flex-col gap-2">
            <span class="text-xs font-medium uppercase text-muted-foreground">Usuários</span>
            <ul class="max-h-56 overflow-auto rounded-md border">
              @for (entry of permissions(); track entry.user_id) {
                <li class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm">{{ entry.name || entry.username }}</span>
                    <span class="block truncate text-xs text-muted-foreground">&#64;{{ entry.username }}</span>
                  </span>
                  <z-checkbox
                    [ngModel]="has(entry.user_id, 'room.view')"
                    (ngModelChange)="toggleUser(entry, 'room.view', $event)"
                    [ngModelOptions]="{ standalone: true }"
                    [zDisabled]="busySubject() === entry.user_id || !canEdit()"
                  >Ver</z-checkbox>
                  <z-checkbox
                    [ngModel]="has(entry.user_id, 'room.send')"
                    (ngModelChange)="toggleUser(entry, 'room.send', $event)"
                    [ngModelOptions]="{ standalone: true }"
                    [zDisabled]="busySubject() === entry.user_id || !canEdit()"
                  >Enviar</z-checkbox>
                </li>
              }
            </ul>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-xs font-medium uppercase text-muted-foreground">Grupos</span>
            @if (groups().length === 0) {
              <p class="text-sm text-muted-foreground">Nenhum grupo cadastrado.</p>
            } @else {
              <ul class="max-h-56 overflow-auto rounded-md border">
                @for (group of groups(); track group.group_id) {
                  <li class="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                    <span class="flex min-w-0 flex-1 items-center gap-2">
                      <span class="size-3 shrink-0 rounded-full ring-1 ring-border" [style.background]="group.color"></span>
                      <span class="truncate text-sm">{{ group.name }}</span>
                    </span>
                    <z-checkbox
                      [ngModel]="hasGroup(group.group_id, 'room.view')"
                      (ngModelChange)="toggleGroup(group, 'room.view', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      [zDisabled]="busySubject() === group.group_id || !canEdit()"
                    >Ver</z-checkbox>
                    <z-checkbox
                      [ngModel]="hasGroup(group.group_id, 'room.send')"
                      (ngModelChange)="toggleGroup(group, 'room.send', $event)"
                      [ngModelOptions]="{ standalone: true }"
                      [zDisabled]="busySubject() === group.group_id || !canEdit()"
                    >Enviar</z-checkbox>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>

      @if (error(); as message) {
        <p role="alert" class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ message }}
        </p>
      }

      <div class="flex justify-end">
        <button z-button zType="outline" type="button" (click)="close()">Fechar</button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomAdminDialogComponent {
  private readonly data = injectDialogData<RoomAdminDialogData>();
  private readonly adminService = inject(AdminService);
  private readonly permissionService = inject(PermissionService);
  private readonly dialogRef = inject(ZardDialogRef<unknown, AdminRoom>);

  /** `rooms.view` opens this dialog; only `rooms.edit` may change it. */
  protected readonly canEdit = computed(() => this.permissionService.can('rooms.edit'));

  protected readonly name = signal(this.data.room.name);
  protected readonly openRoom = signal(true);
  protected readonly permissions = signal<RoomPermissionEntry[]>([]);
  protected readonly groups = signal<RoomPermissionGroup[]>([]);
  protected readonly loadingPermissions = signal(true);
  protected readonly savingName = signal(false);
  /** The user or group id whose save is in flight. */
  protected readonly busySubject = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.reloadPermissions();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected close(): void {
    this.dialogRef.close({ id: this.data.room.id, name: this.name() });
  }

  protected has(userId: string, permission: string): boolean {
    const entry = this.permissions().find(item => item.user_id === userId);
    return entry?.permissions.includes(permission) ?? false;
  }

  protected hasGroup(groupId: string, permission: string): boolean {
    const entry = this.groups().find(item => item.group_id === groupId);
    return entry?.permissions.includes(permission) ?? false;
  }

  protected rename(): void {
    if (!this.canEdit()) {
      return;
    }

    if (!this.name().trim()) {
      this.error.set('Informe o nome da sala.');
      return;
    }

    this.savingName.set(true);
    this.error.set(null);

    this.adminService.renameRoom(this.data.room.id, { name: this.name().trim() }).subscribe({
      next: room => {
        this.savingName.set(false);
        this.dialogRef.close(room);
      },
      error: (err: unknown) => {
        this.savingName.set(false);
        this.error.set(describe(err, 'Não foi possível renomear a sala.'));
      },
    });
  }

  protected toggleUser(entry: RoomPermissionEntry, permission: string, checked: boolean): void {
    this.saveSubject(entry.user_id, { user_id: entry.user_id }, entry.permissions, permission, checked);
  }

  protected toggleGroup(group: RoomPermissionGroup, permission: string, checked: boolean): void {
    this.saveSubject(group.group_id, { group_id: group.group_id }, group.permissions, permission, checked);
  }

  private saveSubject(
    subjectId: string,
    subject: { user_id?: string; group_id?: string },
    current: string[],
    permission: string,
    checked: boolean,
  ): void {
    if (!this.canEdit()) {
      return;
    }

    const next = checked ? [...current, permission] : current.filter(item => item !== permission);

    this.busySubject.set(subjectId);
    this.error.set(null);

    this.adminService
      .setRoomPermissions(this.data.room.id, { ...subject, permissions: next })
      .subscribe({
        next: () => {
          this.busySubject.set(null);
          this.reloadPermissions();
        },
        error: (err: unknown) => {
          this.busySubject.set(null);
          this.error.set(describe(err, 'Não foi possível salvar a permissão.'));
        },
      });
  }

  private reloadPermissions(): void {
    this.loadingPermissions.set(true);
    this.adminService.getRoomPermissions(this.data.room.id).subscribe({
      next: response => {
        this.permissions.set(response.entries);
        this.groups.set(response.groups);
        this.openRoom.set(response.open);
        this.loadingPermissions.set(false);
      },
      error: () => {
        this.loadingPermissions.set(false);
        this.error.set('Não foi possível carregar as permissões.');
      },
    });
  }
}