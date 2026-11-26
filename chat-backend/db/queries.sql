-- name: CreateUser :exec
INSERT INTO users (id, username, password, name)
VALUES ($1, $2, $3, $4);

-- name: CreateAdminUser :exec
INSERT INTO users (id, username, password, name, email)
VALUES ($1, $2, $3, $4, $5);

-- name: GetUserByID :one
SELECT id, username, password, name, created_at
FROM users
WHERE id = $1 AND is_deleted = false;

-- name: GetUserByUsername :one
SELECT id, username, password, name, created_at
FROM users
WHERE username = $1 AND is_deleted = false;

-- name: ListUsers :many
SELECT id, username, name
FROM users
WHERE is_deleted = false
ORDER BY username;

-- name: ListAllUserGroups :many
SELECT gm.user_id, g.id AS group_id, g.name AS group_name, g.color AS group_color
FROM group_members gm
JOIN groups g ON g.id = gm.group_id AND g.is_deleted = false
JOIN users u ON u.id = gm.user_id AND u.is_deleted = false
ORDER BY g.name;

-- name: ListAllUserRoles :many
SELECT u.id AS user_id, r.id AS role_id, r.name AS role_name, r.color AS role_color
FROM users u
JOIN roles r ON r.id = u.role_id AND r.is_deleted = false
WHERE u.is_deleted = false
ORDER BY r.name;

-- name: ListUserGroupsForUser :many
SELECT g.id, g.name, g.color
FROM group_members gm
JOIN groups g ON g.id = gm.group_id AND g.is_deleted = false
WHERE gm.user_id = $1
ORDER BY g.name;

-- name: AddGroupMember :exec
INSERT INTO group_members (user_id, group_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: DeleteGroupMembers :exec
DELETE FROM group_members WHERE user_id = $1;

-- name: RemoveGroupMember :exec
DELETE FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: GetUserRole :one
SELECT r.id, r.name, r.color
FROM users u
JOIN roles r ON r.id = u.role_id AND r.is_deleted = false
WHERE u.id = $1;

-- name: SetUserRole :exec
UPDATE users SET role_id = $2 WHERE id = $1;

-- name: ListAdminUsers :many
SELECT id, username, email, name, created_at
FROM users
WHERE is_deleted = false
ORDER BY username;

-- name: GetAdminUser :one
SELECT id, username, email, name, created_at
FROM users
WHERE id = $1 AND is_deleted = false;

-- name: UpdateUserProfile :exec
UPDATE users
SET name = $2, email = $3
WHERE id = $1 AND is_deleted = false;

-- name: SoftDeleteUser :exec
UPDATE users
SET is_deleted = true
WHERE id = $1;

-- name: LiveUserExists :one
SELECT EXISTS(SELECT 1 FROM users WHERE is_deleted = false);

-- name: UpdateUserPassword :exec
UPDATE users SET password = $2 WHERE id = $1 AND is_deleted = false;

-- name: ReviveUserByUsername :exec
UPDATE users
SET is_deleted = false, password = $2
WHERE username = $1 AND is_deleted = true;

-- name: UserExistsByID :one
SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_deleted = false);

-- name: UserExistsByUsername :one
SELECT EXISTS(SELECT 1 FROM users WHERE username = $1);

-- name: CreateRoom :exec
INSERT INTO rooms (id, name, is_dm)
VALUES ($1, $2, $3);

-- name: AddRoomParticipant :exec
INSERT INTO room_participants (room_id, user_id)
VALUES ($1, $2);

-- name: RoomExistsByName :one
SELECT EXISTS(SELECT 1 FROM rooms WHERE name = $1);

-- name: GetRoomMetadata :one
SELECT id, name, is_dm
FROM rooms
WHERE id = $1;

-- name: ListRooms :many
SELECT id, name, is_dm
FROM rooms
WHERE is_dm = false
ORDER BY created_at;

-- name: ListAllRooms :many
SELECT id, name, is_dm
FROM rooms
WHERE is_dm = false
ORDER BY name;

-- name: RenameRoom :exec
UPDATE rooms SET name = $2 WHERE id = $1 AND is_dm = false;

-- name: RoomNameExistsExcluding :one
SELECT EXISTS(SELECT 1 FROM rooms WHERE name = $1 AND id <> $2);

-- name: ListUserDMs :many
SELECT r.id, r.name, r.is_dm,
       u.id AS other_user_id,
       u.username AS other_username,
       u.name AS other_name
FROM rooms r
JOIN room_participants rp ON rp.room_id = r.id AND rp.user_id = $1
JOIN room_participants op ON op.room_id = r.id AND op.user_id <> $1
JOIN users u ON u.id = op.user_id AND u.is_deleted = false
WHERE r.is_dm = true
ORDER BY r.created_at;

-- name: IsRoomParticipant :one
SELECT EXISTS(
    SELECT 1 FROM room_participants
    WHERE room_id = $1 AND user_id = $2
);

-- name: GetDMParticipants :many
SELECT user_id
FROM room_participants
WHERE room_id = $1
ORDER BY user_id;

-- name: SaveMessage :one
INSERT INTO messages (room_id, author, content, is_file, reply_to_id, sended_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;

-- name: GetHistory :many
SELECT m.room_id, m.author, m.content, m.is_file, m.sended_at,
       m.id, m.reply_to_id,
       parent.room_id AS reply_room_id,
       parent.author AS reply_author,
       parent.content AS reply_content,
       parent.is_file AS reply_is_file
FROM messages m
LEFT JOIN messages parent ON parent.id = m.reply_to_id
WHERE m.room_id = $1
ORDER BY m.sended_at, m.id;

-- name: GetMessageByID :one
SELECT id, room_id, author, content, is_file, sended_at, reply_to_id
FROM messages
WHERE id = $1;

-- name: CreateFile :exec
INSERT INTO files (id, room_id, uploader, file_name, path, hash, format, size_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: GetFile :one
SELECT id, room_id, uploader, file_name, path, hash, format, size_bytes, created_at
FROM files
WHERE id = $1;

-- name: ListGroups :many
SELECT id, name, color
FROM groups
WHERE is_deleted = false
ORDER BY name;

-- name: GetGroup :one
SELECT id, name, color
FROM groups
WHERE id = $1 AND is_deleted = false;

-- name: GetGroupByName :one
SELECT id, name, color
FROM groups
WHERE name = $1 AND is_deleted = false;

-- name: CreateGroup :exec
INSERT INTO groups (id, name, color)
VALUES ($1, $2, $3);

-- name: UpdateGroup :exec
UPDATE groups SET name = $2, color = $3 WHERE id = $1 AND is_deleted = false;

-- name: SoftDeleteGroup :exec
UPDATE groups SET is_deleted = true WHERE id = $1;

-- name: GroupNameExistsExcluding :one
SELECT EXISTS(SELECT 1 FROM groups WHERE name = $1 AND is_deleted = false AND id <> $2);

-- name: ListGroupMembers :many
SELECT u.id, u.username, u.name, u.email
FROM group_members gm
JOIN users u ON u.id = gm.user_id AND u.is_deleted = false
WHERE gm.group_id = $1
ORDER BY u.username;

-- name: UserHasPermission :one
SELECT EXISTS(
    SELECT 1
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id AND u.is_deleted = false
    JOIN groups g ON g.id = gm.group_id AND g.is_deleted = false
    JOIN group_permissions gp ON gp.group_id = gm.group_id
    WHERE gm.user_id = $1
      AND (gp.permission = $2 OR gp.permission = 'admin.all')
);

-- name: ListUserPermissions :many
SELECT DISTINCT gp.permission
FROM group_members gm
JOIN users u ON u.id = gm.user_id AND u.is_deleted = false
JOIN groups g ON g.id = gm.group_id AND g.is_deleted = false
JOIN group_permissions gp ON gp.group_id = gm.group_id
WHERE gm.user_id = $1
ORDER BY gp.permission;

-- name: ListGroupPermissions :many
SELECT permission FROM group_permissions WHERE group_id = $1 ORDER BY permission;

-- name: DeleteGroupPermissions :exec
DELETE FROM group_permissions WHERE group_id = $1;

-- name: AddGroupPermission :exec
INSERT INTO group_permissions (group_id, permission)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RoomHasExplicitPermissions :one
SELECT EXISTS(SELECT 1 FROM room_permissions rp WHERE rp.room_id = $1)
    OR EXISTS(
        SELECT 1
        FROM room_group_permissions rgp
        JOIN groups g ON g.id = rgp.group_id AND g.is_deleted = false
        WHERE rgp.room_id = $1
    );

-- name: UserHasRoomPermission :one
SELECT EXISTS(
    SELECT 1 FROM room_permissions rp
    WHERE rp.room_id = $1 AND rp.user_id = $2 AND rp.permission = $3
) OR EXISTS(
    SELECT 1
    FROM room_group_permissions rgp
    JOIN group_members gm ON gm.group_id = rgp.group_id
    JOIN users u ON u.id = gm.user_id AND u.is_deleted = false
    JOIN groups g ON g.id = rgp.group_id AND g.is_deleted = false
    WHERE rgp.room_id = $1 AND gm.user_id = $2 AND rgp.permission = $3
);

-- name: ListRoomPermissions :many
SELECT rp.user_id, u.username, u.name, rp.permission
FROM room_permissions rp
JOIN users u ON u.id = rp.user_id AND u.is_deleted = false
WHERE rp.room_id = $1
ORDER BY u.username, rp.permission;

-- name: DeleteRoomPermissionsForUser :exec
DELETE FROM room_permissions WHERE room_id = $1 AND user_id = $2;

-- name: AddRoomPermission :exec
INSERT INTO room_permissions (room_id, user_id, permission)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: ListRoomGroupPermissions :many
SELECT rgp.group_id, g.name, g.color, rgp.permission
FROM room_group_permissions rgp
JOIN groups g ON g.id = rgp.group_id AND g.is_deleted = false
WHERE rgp.room_id = $1
ORDER BY g.name, rgp.permission;

-- name: DeleteRoomGroupPermissionsForGroup :exec
DELETE FROM room_group_permissions WHERE room_id = $1 AND group_id = $2;

-- name: AddRoomGroupPermission :exec
INSERT INTO room_group_permissions (room_id, group_id, permission)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: ListRoles :many
SELECT id, name, color
FROM roles
WHERE is_deleted = false
ORDER BY name;

-- name: GetRole :one
SELECT id, name, color
FROM roles
WHERE id = $1 AND is_deleted = false;

-- name: CreateRole :exec
INSERT INTO roles (id, name, color)
VALUES ($1, $2, $3);

-- name: UpdateRole :exec
UPDATE roles SET name = $2, color = $3 WHERE id = $1 AND is_deleted = false;

-- name: SoftDeleteRole :exec
UPDATE roles SET is_deleted = true WHERE id = $1;

-- name: RoleNameExistsExcluding :one
SELECT EXISTS(SELECT 1 FROM roles WHERE name = $1 AND is_deleted = false AND id <> $2);

-- name: ListRoleMembers :many
SELECT u.id, u.username, u.name, u.email
FROM users u
WHERE u.role_id = $1 AND u.is_deleted = false
ORDER BY u.username;
