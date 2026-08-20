-- name: CreateUser :exec
INSERT INTO users (id, username, password, name, role)
VALUES ($1, $2, $3, $4, $5);

-- name: GetUserByID :one
SELECT id, username, password, name, role, created_at
FROM users
WHERE id = $1;

-- name: GetUserByUsername :one
SELECT id, username, password, name, role, created_at
FROM users
WHERE username = $1;

-- name: UserExistsByID :one
SELECT EXISTS(SELECT 1 FROM users WHERE id = $1);

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

-- name: ListUserDMs :many
SELECT r.id, r.name, r.is_dm
FROM rooms r
JOIN room_participants rp ON rp.room_id = r.id
WHERE r.is_dm = true AND rp.user_id = $1
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

-- name: SaveMessage :exec
INSERT INTO messages (room_id, author, content, sended_at)
VALUES ($1, $2, $3, $4);

-- name: GetHistory :many
SELECT room_id, author, content, sended_at
FROM messages
WHERE room_id = $1
ORDER BY sended_at;