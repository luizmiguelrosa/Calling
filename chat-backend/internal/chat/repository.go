package chat

import (
	"chat-backend/internal/database/sqlc"
	"chat-backend/internal/models"
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	SaveMessage(ctx context.Context, msg *models.StoredMessage) (int64, error)
	GetMessageByID(ctx context.Context, id int64) (*models.StoredMessage, error)
	GetHistory(ctx context.Context, roomID string) ([]*models.StoredMessage, error)
	GetRoomMetadata(ctx context.Context, roomID string) (roomName string, isDM bool, exists bool, err error)
	RoomExistsByName(ctx context.Context, roomName string) (bool, error)
	CreateChannel(ctx context.Context, roomID string, roomName string, isDM bool, participants ...string) error
	ListRooms(ctx context.Context) ([]models.RoomResponse, error)
	ListUserDMs(ctx context.Context, userID string) ([]models.DMRoomResponse, error)
	IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error)
	GetDMParticipants(ctx context.Context, roomID string) ([]string, error)
}

type postgresRepository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{
		q: sqlc.New(pool),
	}
}

func (r *postgresRepository) SaveMessage(ctx context.Context, msg *models.StoredMessage) (int64, error) {
	var replyToID pgtype.Int8
	if msg.ReplyToID != nil {
		replyToID = pgtype.Int8{Int64: *msg.ReplyToID, Valid: true}
	}

	return r.q.SaveMessage(ctx, sqlc.SaveMessageParams{
		RoomID:    msg.RoomID,
		Author:    msg.Author,
		Content:   msg.Content,
		IsFile:    msg.IsFile,
		ReplyToID: replyToID,
		SendedAt:  msg.SentAt,
	})
}

func (r *postgresRepository) GetMessageByID(ctx context.Context, id int64) (*models.StoredMessage, error) {
	row, err := r.q.GetMessageByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &models.StoredMessage{
		ID:        row.ID,
		RoomID:    row.RoomID,
		Author:    row.Author,
		Content:   row.Content,
		IsFile:    row.IsFile,
		ReplyToID: int64Ptr(row.ReplyToID),
		SentAt:    row.SendedAt,
	}, nil
}

func (r *postgresRepository) GetHistory(ctx context.Context, roomID string) ([]*models.StoredMessage, error) {
	rows, err := r.q.GetHistory(ctx, roomID)
	if err != nil {
		return nil, err
	}

	messages := make([]*models.StoredMessage, 0, len(rows))
	for _, row := range rows {
		message := &models.StoredMessage{
			ID:        row.ID,
			RoomID:    row.RoomID,
			Author:    row.Author,
			Content:   row.Content,
			IsFile:    row.IsFile,
			ReplyToID: int64Ptr(row.ReplyToID),
			SentAt:    row.SendedAt,
		}

		// The parent row is joined in, so a reply renders its quote without a
		// second query per message.
		if row.ReplyRoomID.Valid && row.ReplyAuthor.Valid && row.ReplyContent.Valid {
			message.ReplyTo = &models.ReplyReference{
				ID:      row.ReplyToID.Int64,
				RoomID:  row.ReplyRoomID.String,
				Author:  row.ReplyAuthor.String,
				Content: row.ReplyContent.String,
				IsFile:  row.ReplyIsFile.Bool,
			}
		}

		messages = append(messages, message)
	}
	return messages, nil
}

func int64Ptr(value pgtype.Int8) *int64 {
	if !value.Valid {
		return nil
	}
	id := value.Int64
	return &id
}

func (r *postgresRepository) GetRoomMetadata(ctx context.Context, roomID string) (string, bool, bool, error) {
	row, err := r.q.GetRoomMetadata(ctx, roomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, false, nil
		}
		return "", false, false, err
	}
	return row.Name, row.IsDm, true, nil
}

func (r *postgresRepository) RoomExistsByName(ctx context.Context, roomName string) (bool, error) {
	return r.q.RoomExistsByName(ctx, roomName)
}

func (r *postgresRepository) CreateChannel(ctx context.Context, roomID string, roomName string, isDM bool, participants ...string) error {
	if err := r.q.CreateRoom(ctx, sqlc.CreateRoomParams{
		ID:   roomID,
		Name: roomName,
		IsDm: isDM,
	}); err != nil {
		return err
	}

	for _, participant := range participants {
		if err := r.q.AddRoomParticipant(ctx, sqlc.AddRoomParticipantParams{
			RoomID: roomID,
			UserID: participant,
		}); err != nil {
			return err
		}
	}

	return nil
}

func (r *postgresRepository) ListRooms(ctx context.Context) ([]models.RoomResponse, error) {
	rows, err := r.q.ListRooms(ctx)
	if err != nil {
		return nil, err
	}

	rooms := make([]models.RoomResponse, 0, len(rows))
	for _, row := range rows {
		rooms = append(rooms, models.RoomResponse{
			ID:   row.ID,
			Name: row.Name,
			IsDM: row.IsDm,
		})
	}
	return rooms, nil
}

func (r *postgresRepository) ListUserDMs(ctx context.Context, userID string) ([]models.DMRoomResponse, error) {
	rows, err := r.q.ListUserDMs(ctx, userID)
	if err != nil {
		return nil, err
	}

	rooms := make([]models.DMRoomResponse, 0, len(rows))
	for _, row := range rows {
		rooms = append(rooms, models.DMRoomResponse{
			RoomResponse: models.RoomResponse{
				ID:   row.ID,
				Name: row.Name,
				IsDM: row.IsDm,
			},
			OtherUserID:   row.OtherUserID,
			OtherUsername: row.OtherUsername,
			OtherName:     row.OtherName,
		})
	}
	return rooms, nil
}

func (r *postgresRepository) IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error) {
	return r.q.IsRoomParticipant(ctx, sqlc.IsRoomParticipantParams{
		RoomID: roomID,
		UserID: userID,
	})
}

func (r *postgresRepository) GetDMParticipants(ctx context.Context, roomID string) ([]string, error) {
	rows, err := r.q.GetDMParticipants(ctx, roomID)
	if err != nil {
		return nil, err
	}

	participants := make([]string, 0, len(rows))
	for _, row := range rows {
		participants = append(participants, row)
	}
	return participants, nil
}
