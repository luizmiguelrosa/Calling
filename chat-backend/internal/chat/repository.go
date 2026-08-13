package chat

import (
	"chat-backend/internal/models"
	"context"
	"slices"
	"sync"
)

type roomMetadata struct {
	Name         string
	IsDM         bool
	Participants []string
}

type Repository interface {
	SaveMessage(ctx context.Context, msg *models.MessageBroadcast) error
	GetHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error)
	GetRoomMetadata(ctx context.Context, roomID string) (roomName string, isDM bool, exists bool, err error)
	RoomExistsByName(ctx context.Context, roomName string) (bool, error)
	CreateChannel(ctx context.Context, roomID string, roomName string, isDM bool, participants ...string) error
	ListRooms(ctx context.Context) ([]models.RoomResponse, error)
	ListUserDMs(ctx context.Context, userID string) ([]models.RoomResponse, error)
	IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error)
	GetDMParticipants(ctx context.Context, roomID string) ([]string, error)
}

type memoryRepository struct {
	history  map[string][]*models.MessageBroadcast
	channels map[string]roomMetadata
	mu       sync.RWMutex
}

func NewRepository() Repository {
	return &memoryRepository{
		history:  make(map[string][]*models.MessageBroadcast),
		channels: make(map[string]roomMetadata),
	}
}

func (r *memoryRepository) SaveMessage(ctx context.Context, msg *models.MessageBroadcast) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.history[msg.RoomID] = append(r.history[msg.RoomID], msg)
	return nil
}

func (r *memoryRepository) GetHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	messages, exists := r.history[roomID]
	if !exists {
		return []*models.MessageBroadcast{}, nil
	}

	return messages, nil
}

func (r *memoryRepository) GetRoomMetadata(ctx context.Context, roomID string) (string, bool, bool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	meta, exists := r.channels[roomID]
	if !exists {
		return "", false, false, nil
	}
	return meta.Name, meta.IsDM, true, nil
}

func (r *memoryRepository) RoomExistsByName(ctx context.Context, roomName string) (bool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, meta := range r.channels {
		if meta.Name == roomName {
			return true, nil
		}
	}
	return false, nil
}

func (r *memoryRepository) CreateChannel(ctx context.Context, roomID string, roomName string, isDM bool, participants ...string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.channels[roomID] = roomMetadata{
		Name:         roomName,
		IsDM:         isDM,
		Participants: participants,
	}
	if r.history[roomID] == nil {
		r.history[roomID] = []*models.MessageBroadcast{}
	}

	return nil
}

func (r *memoryRepository) ListRooms(ctx context.Context) ([]models.RoomResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var rooms []models.RoomResponse

	for id, meta := range r.channels {
		if meta.IsDM {
			continue
		}
		rooms = append(rooms, models.RoomResponse{
			ID:   id,
			Name: meta.Name,
			IsDM: meta.IsDM,
		})
	}
	return rooms, nil
}

func (r *memoryRepository) ListUserDMs(ctx context.Context, userID string) ([]models.RoomResponse, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var rooms []models.RoomResponse
	for id, meta := range r.channels {
		if !meta.IsDM {
			continue
		}
		if slices.Contains(meta.Participants, userID) {
			rooms = append(rooms, models.RoomResponse{
				ID:   id,
				Name: meta.Name,
				IsDM: meta.IsDM,
			})
		}
	}
	return rooms, nil
}

func (r *memoryRepository) IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	meta, exists := r.channels[roomID]
	if !exists {
		return false, nil
	}
	return slices.Contains(meta.Participants, userID), nil
}

func (r *memoryRepository) GetDMParticipants(ctx context.Context, roomID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	meta, exists := r.channels[roomID]
	if !exists {
		return nil, nil
	}
	return meta.Participants, nil
}
