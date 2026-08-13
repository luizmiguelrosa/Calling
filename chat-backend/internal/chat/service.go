package chat

import (
	"chat-backend/internal/models"
	"context"
	"errors"
	"strconv"
	"strings"
	"time"
)

type Service interface {
	ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, bool, error)
	GetRoomHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error)
	CreateChannel(ctx context.Context, input models.CreateRoomInput) (models.RoomResponse, error)
	GetAvailableChannels(ctx context.Context) ([]models.RoomResponse, error)
	CreateDM(ctx context.Context, userID string, input models.CreateDMInput) (models.RoomResponse, error)
	GetUserDMs(ctx context.Context, userID string) ([]models.RoomResponse, error)
	GetDMParticipants(ctx context.Context, roomID string) ([]string, error)
}

type chatService struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &chatService{
		repo: repo,
	}
}

func (s *chatService) ProcessAndStoreMessage(ctx context.Context, userID string, incoming models.IncomingMessage) (*models.MessageBroadcast, bool, error) {
	_, isDM, exists, _ := s.repo.GetRoomMetadata(ctx, incoming.RoomID)
	if !exists {
		return nil, false, errors.New("not_found: target room does not exist")
	}

	if isDM {
		isParticipant, err := s.repo.IsRoomParticipant(ctx, incoming.RoomID, userID)
		if err != nil {
			return nil, false, err
		}
		if !isParticipant {
			return nil, false, errors.New("forbidden: you are not a participant of this direct message room")
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
		return nil, false, err
	}

	return msg, isDM, nil
}

func (s *chatService) GetRoomHistory(ctx context.Context, roomID string) ([]*models.MessageBroadcast, error) {
	if roomID == "" {
		return nil, errors.New("room_id cannot be empty")
	}

	_, _, exists, _ := s.repo.GetRoomMetadata(ctx, roomID)
	if !exists {
		return nil, errors.New("not_found: room does not exists")
	}

	return s.repo.GetHistory(ctx, roomID)
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

func (s *chatService) GetAvailableChannels(ctx context.Context) ([]models.RoomResponse, error) {
	return s.repo.ListRooms(ctx)
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

func (s *chatService) GetUserDMs(ctx context.Context, userID string) ([]models.RoomResponse, error) {
	return s.repo.ListUserDMs(ctx, userID)
}

func (s *chatService) GetDMParticipants(ctx context.Context, roomID string) ([]string, error) {
	return s.repo.GetDMParticipants(ctx, roomID)
}
