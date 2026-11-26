/** The display role a user carries. A user has exactly one, shown in the profile preview. */
interface AdminRoleRef {
  id: string;
  name: string;
  color: string;
}

/** A group as a user row points at it, with the colour its chip uses. */
interface AdminGroupRef {
  id: string;
  name: string;
  color: string;
}

/** A user inside a group or role member table. */
interface AdminMember {
  id: string;
  username: string;
  name: string;
  email: string;
  role: AdminRoleRef | null;
  groups: AdminGroupRef[];
}

/** A row of the admin users table. */
interface AdminUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: AdminRoleRef | null;
  groups: AdminGroupRef[];
  created_at: string;
}

/** A group with its members and general permissions. Groups are the permission-bearing entity. */
interface AdminGroup {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  members: AdminMember[];
}

/** A display-only role with the users that carry it. It grants nothing. */
interface AdminRole {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  members: AdminMember[];
}

/** A public room as the admin room table lists it. */
interface AdminRoom {
  id: string;
  name: string;
}

/** One user's explicit per-room grants. */
interface RoomPermissionEntry {
  user_id: string;
  username: string;
  name: string;
  permissions: string[];
}

/** One group's explicit per-room grants; membership applies them to members. */
interface RoomPermissionGroup {
  group_id: string;
  name: string;
  color: string;
  permissions: string[];
}

/**
 * The per-room permission payload. `open` is true while no explicit rows exist,
 * meaning every authenticated user keeps access.
 */
interface RoomPermissions {
  open: boolean;
  entries: RoomPermissionEntry[];
  groups: RoomPermissionGroup[];
}

/** One general permission in the catalog. */
interface PermissionDefinition {
  key: string;
  label: string;
}

/** The general permissions the signed-in user holds. */
interface MyPermissions {
  permissions: string[];
}

interface AdminCreateUserInput {
  username: string;
  password: string;
  name: string;
  email: string;
  role_id: string;
  group_ids: string[];
}

interface AdminUpdateUserInput {
  name: string;
  email: string;
  role_id: string;
  group_ids: string[];
}

interface AdminGroupInput {
  name: string;
  color: string;
}

interface AdminRoleInput {
  name: string;
  color: string;
}

interface AdminRoomInput {
  name: string;
}

interface AdminRoomPermissionsInput {
  user_id?: string;
  group_id?: string;
  permissions: string[];
}

interface AdminGroupPermissionsInput {
  permissions: string[];
}

interface AdminRolePermissionsInput {
  permissions: string[];
}