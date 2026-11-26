-- Additive changes for databases created before these objects existed. The
-- container's init script only runs when the volume is first created, so an
-- existing database would otherwise never gain a table or column added later.
--
-- Every statement here must be idempotent: this file runs on every startup.

-- `messages.is_file` marks a message whose content is a JSON FileContent rather
-- than free text. Older rows are plain text, so the default is false.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_file BOOLEAN NOT NULL DEFAULT false;

-- A reply stores the id of the message it quotes. Nullable: every message that
-- predates replies has none, and a deleted parent leaves the reply in place.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

-- Legacy user columns. `role` keeps a historical name label and `role_id` the
-- display role link; neither drives authorization any more. They stay so an
-- existing installation does not lose the data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN role SET DEFAULT '';

-- One-time markers are created before the guarded data migrations below.
CREATE TABLE IF NOT EXISTS migration_markers (
    name        TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Display roles: one per user, shown in the profile preview. They carry a colour
-- for the chip but no permissions. On a database that still has the old
-- permission-bearing `roles` table this is a no-op; the migration below clears
-- it once its rows have moved into `groups`.
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#00519F',
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE roles ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#00519F';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Groups are the permission-bearing grouping of users. A user may hold several,
-- so membership lives in `group_members`.
CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#00519F',
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#00519F';

CREATE TABLE IF NOT EXISTS group_members (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS group_permissions (
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (group_id, permission)
);

CREATE TABLE IF NOT EXISTS room_permissions (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id, permission)
);

-- Group grants are resolved through `group_members`, so a group assignment
-- applies the room permissions to every member without a per-user row.
CREATE TABLE IF NOT EXISTS room_group_permissions (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (room_id, group_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_permissions_user_id ON room_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_room_group_permissions_group_id ON room_group_permissions(group_id);

-- One-time move from the permission-bearing roles into groups. The marker is
-- inserted in the same block as the data changes, so a failure rolls the whole
-- migration back and a later startup retries it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM migration_markers WHERE name = 'groups-restored') THEN
        RETURN;
    END IF;

    -- A fresh database never had the permission-bearing role tables, so there is
    -- nothing to move.
    IF to_regclass('user_roles') IS NULL THEN
        INSERT INTO migration_markers (name) VALUES ('groups-restored');
        RETURN;
    END IF;

    INSERT INTO groups (id, name, color, is_deleted, created_at)
    SELECT id, name, color, is_deleted, created_at FROM roles
    ON CONFLICT DO NOTHING;

    INSERT INTO group_members (user_id, group_id)
    SELECT user_id, role_id FROM user_roles
    ON CONFLICT DO NOTHING;

    INSERT INTO group_permissions (group_id, permission)
    SELECT role_id, permission FROM role_permissions
    ON CONFLICT DO NOTHING;

    INSERT INTO room_group_permissions (room_id, group_id, permission)
    SELECT room_id, role_id, permission FROM room_role_permissions
    ON CONFLICT DO NOTHING;

    -- `roles` is now the display-only label table; it starts empty.
    DELETE FROM roles;

    DROP TABLE IF EXISTS room_role_permissions;
    DROP TABLE IF EXISTS role_permissions;
    DROP TABLE IF EXISTS user_roles;

    INSERT INTO migration_markers (name) VALUES ('groups-restored');
END $$;

-- The Admin group is seeded with the full catalog, and only while it has no
-- permissions rows at all — so an admin edit is not silently reverted on the
-- next startup. Access is denied by default for every other group.
INSERT INTO groups (id, name) VALUES ('group-admin', 'Admin')
ON CONFLICT DO NOTHING;

INSERT INTO group_permissions (group_id, permission)
SELECT g.id, permission
FROM groups g
CROSS JOIN unnest(ARRAY[
    'admin.all',
    'rooms.create',
    'rooms.edit',
    'rooms.view',
    'users.manage',
    'roles.manage',
    'groups.manage'
]) AS permission
WHERE g.name = 'Admin'
  AND NOT EXISTS (SELECT 1 FROM group_permissions WHERE group_id = g.id)
ON CONFLICT DO NOTHING;
