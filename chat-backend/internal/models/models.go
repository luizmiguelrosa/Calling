package models

import (
	"time"
)

type TypeRoom string

const (
	PublicRoom TypeRoom = "public"
	DirectRoom TypeRoom = "direct"
)

// MessageBroadcast is a message as the client receives it. When IsFile is true
// the Content is not free text but a JSON FileAttachment, so the client knows to
// render the file rather than the string.
type MessageBroadcast struct {
	RoomID  string `json:"room_id"`
	Author  string `json:"author"`
	Content string `json:"content"`
	IsFile  bool   `json:"is_file"`
	// ID is the stored row. The client needs it to scroll to a message and to
	// reference it as the parent of a reply.
	ID int64 `json:"id"`
	// ReplyTo is the quoted message when this one is a reply. It is a snapshot,
	// resolved at delivery time, so a client that has not loaded the parent can
	// still render the quote.
	ReplyTo *ReplyReference `json:"reply_to,omitempty"`
	SentAt  time.Time       `json:"sentAt"`
}

// ReplyReference is the quoted message a reply carries: enough to render the
// preview, and the room id needed to navigate back to the original.
type ReplyReference struct {
	ID      int64  `json:"id"`
	RoomID  string `json:"room_id"`
	Author  string `json:"author"`
	Content string `json:"content"`
	IsFile  bool   `json:"is_file"`
}

// StoredMessage is a message row as it lives in the database. Content is the raw
// column value, which is JSON for a file message; the service turns it into the
// client-facing shape.
type StoredMessage struct {
	ID        int64
	RoomID    string
	Author    string
	Content   string
	IsFile    bool
	ReplyToID *int64
	ReplyTo   *ReplyReference
	SentAt    time.Time
}

// FileContent is the JSON stored in messages.content when a message carries a
// file: the id of the stored file and the caption that travelled with it. The
// file's name, path and hash are resolved from the files table at delivery time
// so the message row stays small and the file metadata has a single source.
type FileContent struct {
	FileID  string `json:"file_id"`
	Message string `json:"message"`
}

// FileAttachment is the JSON a file message carries to the client: the original
// name, the server path it is served from, its on-disk format (which decides
// whether the client renders an image or an attachment card), and the hash the
// client recomputes to verify the file arrived intact.
type FileAttachment struct {
	FileName string `json:"file_name"`
	Path     string `json:"path"`
	Hash     string `json:"hash"`
	Format   string `json:"format"`
	Message  string `json:"message,omitempty"`
}

// FileResponse is what an upload returns: the id to reference in a message,
// plus the name, path, format and hash the client needs to display and verify it.
type FileResponse struct {
	ID       string `json:"id"`
	FileName string `json:"file_name"`
	Path     string `json:"path"`
	Hash     string `json:"hash"`
	Format   string `json:"format"`
}

// IncomingMessage is a message sent over the socket. A file message references a
// file already uploaded through the room's file endpoint, so it carries a
// file_id and may omit the caption.
type IncomingMessage struct {
	RoomID    string `json:"room_id" validate:"required,min=3"`
	Content   string `json:"content" validate:"required_without=IsFile,max=500"`
	IsFile    bool   `json:"is_file"`
	FileID    string `json:"file_id" validate:"required_if=IsFile true"`
	ReplyToID *int64 `json:"reply_to_id"`
}

// BatchMessageInput is one message of a batch send. A file message references a
// file already uploaded through the room's file endpoint.
type BatchMessageInput struct {
	Content   string `json:"content" validate:"required_without=IsFile,max=500"`
	IsFile    bool   `json:"is_file"`
	FileID    string `json:"file_id" validate:"required_if=IsFile true"`
	ReplyToID *int64 `json:"reply_to_id"`
}

// BatchSendInput is the body of POST /messages/batch: several messages for one
// room, stored in a single request.
type BatchSendInput struct {
	RoomID   string              `json:"room_id" validate:"required,min=3"`
	Messages []BatchMessageInput `json:"messages" validate:"required,min=1,max=50,dive"`
}

// IncomingEnvelope peeks at the frame type before the payload is validated: a
// typing frame and a chat message have different required fields, so the type
// has to be read before choosing which DTO to validate against.
type IncomingEnvelope struct {
	Type string `json:"type"`
}

// TypingEvent is a typing-state change for a room. It carries no content — the
// frame only tells peers whether the author started or stopped typing.
type TypingEvent struct {
	RoomID string `json:"room_id" validate:"required,min=3"`
	Typing bool   `json:"typing"`
}

// TypingBroadcast is a TypingEvent as peers receive it, tagged so the client can
// tell it apart from a message broadcast.
type TypingBroadcast struct {
	Type   string `json:"type"`
	RoomID string `json:"room_id"`
	Author string `json:"author"`
	Typing bool   `json:"typing"`
}

// StatusEvent is a presence-status change for the signed-in user. It is not
// scoped to a room: availability is global, so it is relayed to every other
// connected client.
type StatusEvent struct {
	Status string `json:"status" validate:"required,oneof=online away dnd"`
}

// StatusBroadcast is a StatusEvent as peers receive it, tagged so the client can
// tell it apart from a message or typing frame. "offline" is only ever sent by
// the server, when the user's last connection closes.
type StatusBroadcast struct {
	Type   string `json:"type"`
	Author string `json:"author"`
	Status string `json:"status"`
}

type CreateRoomInput struct {
	Name string `json:"name" validate:"required,min=3,max=32"`
	IsDM bool   `json:"is_dm"`
}

type CreateDMInput struct {
	ReceiverID string `json:"receiver_id" validate:"required"`
}

type RoomResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	IsDM bool   `json:"is_dm"`
}

// DMRoomResponse is a RoomResponse plus the participant on the other side.
// The canonical DM room name is just the two user IDs, so without this the
// client cannot tell which conversation belongs to which person.
type DMRoomResponse struct {
	RoomResponse
	OtherUserID   string `json:"other_user_id"`
	OtherUsername string `json:"other_username"`
	OtherName     string `json:"other_name"`
}
