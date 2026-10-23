CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id, sended_at);
CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_files_room_id ON files(room_id);
