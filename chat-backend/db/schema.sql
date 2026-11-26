-- Roles are a display-only label: one per user, shown in the profile preview.
-- They carry a colour for the chip but no permissions.
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#00519F',
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    -- Legacy free-text label, kept so older rows keep their historical value.
    -- The display role is `role_id`.
    role        TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL DEFAULT '',
    role_id     TEXT REFERENCES roles(id) ON DELETE SET NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups are the permission-bearing grouping of users: each one carries a
-- colour, a member list, general permissions, and per-room grants. A user may
-- hold several groups, so membership lives in `group_members`.
CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#00519F',
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    is_dm       BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_participants (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- For a plain message this is the text. For a file message it is a JSON
    -- object holding the file id and the caption, so the file's own metadata
    -- (name, path, hash) lives in one place — the files table.
    content     TEXT NOT NULL,
    is_file     BOOLEAN NOT NULL DEFAULT false,
    -- The message this one quotes, if any. A reply stores only the reference;
    -- the quoted text is resolved from the row at delivery time so an edit of
    -- the parent (or its file) is reflected without a second copy.
    reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    sended_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every uploaded room image. The row is the source of truth for the file's
-- name, path and hash; the message only references it by id.
CREATE TABLE IF NOT EXISTS files (
    id          TEXT PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    uploader    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name   TEXT NOT NULL,
    path        TEXT NOT NULL,
    hash        TEXT NOT NULL,
    format      TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- General permissions are granted to a group; the admin panel checks the keys
-- declared in the permissions catalog.
CREATE TABLE IF NOT EXISTS group_permissions (
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (group_id, permission)
);

-- Per-room permissions. A room with no explicit rows is open to every
-- authenticated user; once an admin grants rows, only those users (plus groups
-- holding `admin.all`) keep access.
CREATE TABLE IF NOT EXISTS room_permissions (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (room_id, user_id, permission)
);

-- Group grants are checked through `group_members`, so adding a member to a
-- granted group gives that member the room permission without a per-user row. A
-- room with no rows in either table stays open to every authenticated user.
CREATE TABLE IF NOT EXISTS room_group_permissions (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (room_id, group_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id, sended_at);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_files_room_id ON files(room_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_permissions_user_id ON room_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_room_group_permissions_group_id ON room_group_permissions(group_id);
