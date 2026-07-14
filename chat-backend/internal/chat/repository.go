package chat

import (
	"chat-backend/internal/models"
	"context"
	"errors"
	"maps"
	"slices"
	"sync"
)

type Repository interface {
	SaveMessage(ctx context.Context, msg *models.MessageBroadcast) error
	GetHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error)
	CreateChannel(ctx context.Context, roomName string) error
}

type memoryRepository struct {
	history  map[string][]*models.MessageBroadcast
	channels map[string][]string
	mu       sync.RWMutex
}

func NewRepository() Repository {
	return &memoryRepository{
		history:  make(map[string][]*models.MessageBroadcast),
		channels: make(map[string][]string),
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

func (r *memoryRepository) CreateChannel(ctx context.Context, roomName string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if c := maps.Values(r.channels); slices.Contains(c, roomName) {
		return errors.New("Canal já existente")
	}
	r.channels[roomID] = roomName
	return nil
}
