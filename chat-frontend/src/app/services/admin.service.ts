import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';

/**
 * The admin API. Every call is authorized server-side by the permission of its
 * category; this service is only the transport.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  listUsers(): Observable<AdminUser[]> {
    return this.api.get<AdminUser[]>('/admin/users');
  }

  createUser(input: AdminCreateUserInput): Observable<AdminUser> {
    return this.api.post<AdminUser>('/admin/users', input);
  }

  updateUser(id: string, input: AdminUpdateUserInput): Observable<AdminUser> {
    return this.api.put<AdminUser>('/admin/users', id, input);
  }

  deleteUser(id: string): Observable<void> {
    return this.api.delete<void>('/admin/users', id);
  }

  listGroups(): Observable<AdminGroup[]> {
    return this.api.get<AdminGroup[]>('/admin/groups');
  }

  /** Group id/name/colour pairs for a selector; readable by any signed-in user. */
  listGroupOptions(): Observable<AdminGroupRef[]> {
    return this.api.get<AdminGroupRef[]>('/groups');
  }

  createGroup(input: AdminGroupInput): Observable<AdminGroup> {
    return this.api.post<AdminGroup>('/admin/groups', input);
  }

  updateGroup(id: string, input: AdminGroupInput): Observable<AdminGroup> {
    return this.api.put<AdminGroup>('/admin/groups', id, input);
  }

  deleteGroup(id: string): Observable<void> {
    return this.api.delete<void>('/admin/groups', id);
  }

  removeGroupMember(groupId: string, userId: string): Observable<void> {
    return this.api.delete<void>(`/admin/groups/${groupId}/members`, userId);
  }

  setGroupPermissions(groupId: string, input: AdminGroupPermissionsInput): Observable<void> {
    return this.api.putBody<void>(`/admin/groups/${groupId}/permissions`, input);
  }

  listRoles(): Observable<AdminRole[]> {
    return this.api.get<AdminRole[]>('/admin/roles');
  }

  /** Role id/name/colour pairs for a selector; readable by any signed-in user. */
  listRoleOptions(): Observable<AdminRoleRef[]> {
    return this.api.get<AdminRoleRef[]>('/roles');
  }

  createRole(input: AdminRoleInput): Observable<AdminRole> {
    return this.api.post<AdminRole>('/admin/roles', input);
  }

  updateRole(id: string, input: AdminRoleInput): Observable<AdminRole> {
    return this.api.put<AdminRole>('/admin/roles', id, input);
  }

  deleteRole(id: string): Observable<void> {
    return this.api.delete<void>('/admin/roles', id);
  }

  removeRoleMember(roleId: string, userId: string): Observable<void> {
    return this.api.delete<void>(`/admin/roles/${roleId}/members`, userId);
  }

  setRolePermissions(roleId: string, input: AdminRolePermissionsInput): Observable<void> {
    return this.api.putBody<void>(`/admin/roles/${roleId}/permissions`, input);
  }

  listRooms(): Observable<AdminRoom[]> {
    return this.api.get<AdminRoom[]>('/admin/rooms');
  }

  renameRoom(id: string, input: AdminRoomInput): Observable<AdminRoom> {
    return this.api.put<AdminRoom>('/admin/rooms', id, input);
  }

  getRoomPermissions(roomId: string): Observable<RoomPermissions> {
    return this.api.get<RoomPermissions>(`/admin/rooms/${roomId}/permissions`);
  }

  setRoomPermissions(roomId: string, input: AdminRoomPermissionsInput): Observable<void> {
    return this.api.putBody<void>(`/admin/rooms/${roomId}/permissions`, input);
  }

  getPermissionCatalog(): Observable<PermissionDefinition[]> {
    return this.api.get<PermissionDefinition[]>('/admin/permissions');
  }
}