package chat

import (
	"chat-backend/internal/models"
	"context"
	"errors"
	"slices"
	"strings"
	"time"
)

type Service interface {
	ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, error)
	GetRoomHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error)
}

type chatService struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &chatService{
		repo: repo,
	}
}

func (s *chatService) ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, error) {
	if after, ok := strings.CutPrefix(incoming.RoomID, "dm:"); ok {
		participants := strings.Split(after, "-")

		if !slices.Contains(participants, userID) {
			return nil, errors.New("unauthorized: you do not belong to this private chat")
		}
	}

	cleanContent := strings.TrimSpace(incoming.Content)

	msg := &models.MessageBroadcast{
		RoomID:   incoming.RoomID,
		Author:   userID,
		Content:  cleanContent,
		SendedAt: time.Now(),
	}

	if err := s.repo.SaveMessage(ctx, msg); err != nil {
		return nil, err
	}

	return msg, nil
}

func (s *chatService) GetRoomHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error) {
	if roomID == "" {
		return nil, errors.New("room_id cannot be empty")
	}
	return s.repo.GetHistory(ctx, roomID)
}
