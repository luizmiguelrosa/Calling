package chat

import (
	"chat-backend/internal/files"
	"chat-backend/internal/models"
	"chat-backend/internal/permissions"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

type Service interface {
	ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, bool, error)
	SendBatch(ctx context.Context, userID string, input models.BatchSendInput) ([]*models.MessageBroadcast, bool, error)
	ResolveRoomAccess(ctx context.Context, userID string, roomID string) (bool, error)
	GetRoomHistory(ctx context.Context, userID string, roomID string) ([]*models.MessageBroadcast, error)
	// GetMessage resolves one message by id. A cross-room reply needs it: the
	// composer in the DM can only carry the id of the message it quotes.
	GetMessage(ctx context.Context, userID string, messageID int64) (*models.MessageBroadcast, error)
	CreateChannel(ctx context.Context, input models.CreateRoomInput) (models.RoomResponse, error)
	GetAvailableChannels(ctx context.Context, userID string) ([]models.RoomResponse, error)
	CreateDM(ctx context.Context, userID string, input models.CreateDMInput) (models.RoomResponse, error)
	GetUserDMs(ctx context.Context, userID string) ([]models.DMRoomResponse, error)
	GetDMParticipants(ctx context.Context, roomID string) ([]string, error)
}

type chatService struct {
	repo        Repository
	files       files.Service
	permissions permissions.Service
}

func NewService(repo Repository, fileService files.Service, permissionService permissions.Service) Service {
	return &chatService{
		repo:        repo,
		files:       fileService,
		permissions: permissionService,
	}
}

func (s *chatService) ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, bool, error) {
	isDM, err := s.ResolveRoomAccess(ctx, userID, incoming.RoomID)
	if err != nil {
		return nil, false, err
	}

	stored, err := s.buildStored(ctx, userID, incoming.RoomID, incoming.Content, incoming.IsFile, incoming.FileID, incoming.ReplyToID)
	if err != nil {
		return nil, false, err
	}

	if !isDM {
		allowed, err := s.permissions.CanSendRoom(ctx, userID, incoming.RoomID)
		if err != nil {
			return nil, false, err
		}
		if !allowed {
			return nil, false, errors.New("forbidden: you cannot send messages in this room")
		}
	}

	id, err := s.repo.SaveMessage(ctx, stored)
	if err != nil {
		return nil, false, err
	}
	stored.ID = id

	broadcast := s.toBroadcast(ctx, stored)

	return broadcast, isDM, nil
}

// SendBatch stores several messages for one room in a single call. Each message
// may carry a file that was uploaded beforehand, so a batch never references a
// path that was not persisted.
func (s *chatService) SendBatch(ctx context.Context, userID string, input models.BatchSendInput) ([]*models.MessageBroadcast, bool, error) {
	isDM, err := s.ResolveRoomAccess(ctx, userID, input.RoomID)
	if err != nil {
		return nil, false, err
	}

	if !isDM {
		allowed, err := s.permissions.CanSendRoom(ctx, userID, input.RoomID)
		if err != nil {
			return nil, false, err
		}
		if !allowed {
			return nil, false, errors.New("forbidden: you cannot send messages in this room")
		}
	}

	messages := make([]*models.MessageBroadcast, 0, len(input.Messages))
	for _, entry := range input.Messages {
		stored, err := s.buildStored(ctx, userID, input.RoomID, entry.Content, entry.IsFile, entry.FileID, entry.ReplyToID)
		if err != nil {
			return nil, false, err
		}

		id, err := s.repo.SaveMessage(ctx, stored)
		if err != nil {
			return nil, false, err
		}
		stored.ID = id

		broadcast := s.toBroadcast(ctx, stored)
		messages = append(messages, broadcast)
	}

	return messages, isDM, nil
}

// buildStored turns an incoming message into the row that will be written. A
// file message stores a JSON FileContent — the file id and the caption — rather
// than the file's name, path and hash, which are resolved from the files table
// when the message is delivered.
func (s *chatService) buildStored(ctx context.Context, userID, roomID, content string, isFile bool, fileID string, replyToID *int64) (*models.StoredMessage, error) {
	// The client identifies a message by its room, author, timestamp, and content
	// to avoid appending a buffered broadcast twice after a history reload. It
	// compares the timestamp as an instant, so the broadcast and the stored column
	// need not serialize identically — but the value is still normalized to UTC at
	// microsecond precision so the column is deterministic: a raw time.Now()
	// carries nanoseconds, and PostgreSQL stores TIMESTAMPTZ at microsecond
	// precision.
	sentAt := time.Now().UTC().Truncate(time.Microsecond)
	caption := strings.TrimSpace(content)

	if replyToID != nil {
		// The parent may live in another room (a private reply quotes a public
		// message), so only the row is checked for existence here; the reply
		// snapshot stored on the message is resolved at delivery time.
		if _, err := s.repo.GetMessageByID(ctx, *replyToID); err != nil {
			return nil, errors.New("not_found: replied message does not exist")
		}
	}

	if !isFile {
		return &models.StoredMessage{
			RoomID:    roomID,
			Author:    userID,
			Content:   caption,
			ReplyToID: replyToID,
			SentAt:    sentAt,
		}, nil
	}

	// Resolving here rejects a file id that does not exist before a row is
	// written, so a message can never point at a missing file.
	if _, err := s.files.ResolveAttachment(ctx, fileID); err != nil {
		return nil, err
	}

	encoded, err := json.Marshal(models.FileContent{FileID: fileID, Message: caption})
	if err != nil {
		return nil, err
	}

	return &models.StoredMessage{
		RoomID:    roomID,
		Author:    userID,
		Content:   string(encoded),
		IsFile:    true,
		ReplyToID: replyToID,
		SentAt:    sentAt,
	}, nil
}

// toBroadcast is the client-facing shape of a stored row. A file message's
// content becomes the JSON the client renders: the file name, the path it is
// served from, and the hash it verifies the download against.
func (s *chatService) toBroadcast(ctx context.Context, stored *models.StoredMessage) *models.MessageBroadcast {
	broadcast := &models.MessageBroadcast{
		RoomID:  stored.RoomID,
		Author:  stored.Author,
		Content: stored.Content,
		IsFile:  stored.IsFile,
		ID:      stored.ID,
		SentAt:  stored.SentAt,
	}

	if stored.ReplyTo != nil {
		broadcast.ReplyTo = s.resolveReplyReference(ctx, stored.ReplyTo)
	}

	if !stored.IsFile {
		return broadcast
	}

	broadcast.Content = s.resolveAttachmentContent(ctx, stored.Content)
	return broadcast
}

// resolveAttachmentContent turns a stored FileContent into the client-facing
// FileAttachment. A malformed row is left as-is rather than dropped, so a
// broken message still shows something.
func (s *chatService) resolveAttachmentContent(ctx context.Context, raw string) string {
	var content models.FileContent
	if err := json.Unmarshal([]byte(raw), &content); err != nil {
		return raw
	}

	attachment, err := s.files.ResolveAttachment(ctx, content.FileID)
	if err != nil {
		return raw
	}
	attachment.Message = content.Message

	encoded, err := json.Marshal(attachment)
	if err != nil {
		return raw
	}
	return string(encoded)
}

// resolveReplyReference makes a quoted message's content the same client-facing
// shape the message itself carries, so the client parses a file quote the same
// way it parses a file message.
func (s *chatService) resolveReplyReference(ctx context.Context, reference *models.ReplyReference) *models.ReplyReference {
	resolved := *reference
	if resolved.IsFile {
		resolved.Content = s.resolveAttachmentContent(ctx, resolved.Content)
	}
	return &resolved
}

// GetMessage resolves one message for the composer of a cross-room reply. Access
// is checked against the message's own room, since that is where the client will
// jump when the quote is clicked.
func (s *chatService) GetMessage(ctx context.Context, userID string, messageID int64) (*models.MessageBroadcast, error) {
	stored, err := s.repo.GetMessageByID(ctx, messageID)
	if err != nil {
		return nil, errors.New("not_found: message does not exist")
	}

	if _, err := s.ResolveRoomAccess(ctx, userID, stored.RoomID); err != nil {
		return nil, err
	}

	return s.toBroadcast(ctx, stored), nil
}

// ResolveRoomAccess validates that the room exists and, for a DM, that the user
// belongs to it, returning whether the room is a direct message. Both message
// and typing frames need this before they can be routed.
func (s *chatService) ResolveRoomAccess(ctx context.Context, userID string, roomID string) (bool, error) {
	_, isDM, exists, _ := s.repo.GetRoomMetadata(ctx, roomID)
	if !exists {
		return false, errors.New("not_found: target room does not exist")
	}

	if isDM {
		isParticipant, err := s.repo.IsRoomParticipant(ctx, roomID, userID)
		if err != nil {
			return false, err
		}
		if !isParticipant {
			return false, errors.New("forbidden: you are not a participant of this direct message room")
		}
		return true, nil
	}

	allowed, err := s.permissions.CanViewRoom(ctx, userID, roomID)
	if err != nil {
		return false, err
	}
	if !allowed {
		return false, errors.New("forbidden: you cannot view this room")
	}

	return false, nil
}

func (s *chatService) GetRoomHistory(ctx context.Context, userID string, roomID string) ([]*models.MessageBroadcast, error) {
	if roomID == "" {
		return nil, errors.New("room_id cannot be empty")
	}

	if _, err := s.ResolveRoomAccess(ctx, userID, roomID); err != nil {
		return nil, err
	}

	stored, err := s.repo.GetHistory(ctx, roomID)
	if err != nil {
		return nil, err
	}

	messages := make([]*models.MessageBroadcast, 0, len(stored))
	for _, row := range stored {
		broadcast := s.toBroadcast(ctx, row)
		messages = append(messages, broadcast)
	}

	return messages, nil
}

func (s *chatService) CreateChannel(ctx context.Context, input models.CreateRoomInput) (models.RoomResponse, error) {
	roomName := strings.TrimSpace(input.Name)

	exists, err := s.repo.RoomExistsByName(ctx, roomName)
	if err != nil {
		return models.RoomResponse{}, err
	}
	if exists {
		return models.RoomResponse{}, errors.New("conflict: room name already exists")
	}

	roomID := strconv.FormatInt(time.Now().UnixNano(), 10)
	if err := s.repo.CreateChannel(ctx, roomID, roomName, input.IsDM); err != nil {
		return models.RoomResponse{}, err
	}

	return models.RoomResponse{
			ID:   roomID,
			Name: roomName,
			IsDM: input.IsDM,
		},
		nil
}

func (s *chatService) GetAvailableChannels(ctx context.Context, userID string) ([]models.RoomResponse, error) {
	rooms, err := s.repo.ListRooms(ctx)
	if err != nil {
		return nil, err
	}

	// A room with explicit permissions is only listed for someone who may view
	// it, so a restricted room does not advertise itself in the room list.
	visible := make([]models.RoomResponse, 0, len(rooms))
	for _, room := range rooms {
		allowed, err := s.permissions.CanViewRoom(ctx, userID, room.ID)
		if err != nil {
			return nil, err
		}
		if allowed {
			visible = append(visible, room)
		}
	}
	return visible, nil
}

func (s *chatService) CreateDM(ctx context.Context, userID string, input models.CreateDMInput) (models.RoomResponse, error) {
	var roomName string
	if userID < input.ReceiverID {
		roomName = userID + "-" + input.ReceiverID
	} else {
		roomName = input.ReceiverID + "-" + userID
	}

	exists, err := s.repo.RoomExistsByName(ctx, roomName)
	if err != nil {
		return models.RoomResponse{}, err
	}
	if exists {
		return models.RoomResponse{}, errors.New("conflict: direct message room already exists")
	}

	roomID := strconv.FormatInt(time.Now().UnixNano(), 10)
	if err := s.repo.CreateChannel(ctx, roomID, roomName, true, userID, input.ReceiverID); err != nil {
		return models.RoomResponse{}, err
	}

	return models.RoomResponse{
		ID:   roomID,
		Name: roomName,
		IsDM: true,
	}, nil
}

func (s *chatService) GetUserDMs(ctx context.Context, userID string) ([]models.DMRoomResponse, error) {
	return s.repo.ListUserDMs(ctx, userID)
}

func (s *chatService) GetDMParticipants(ctx context.Context, roomID string) ([]string, error) {
	return s.repo.GetDMParticipants(ctx, roomID)
}
