package files

import (
	"chat-backend/internal/database/sqlc"
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrFileNotFound is returned when a referenced file id has no row.
var ErrFileNotFound = errors.New("not_found: file does not exist")

// StoredFile is a files-table row mapped into a domain type, so the service does
// not depend on the generated sqlc model.
type StoredFile struct {
	ID       string
	RoomID   string
	Uploader string
	FileName string
	Path     string
	Hash     string
	Format   string
	Size     int64
}

type Repository interface {
	Save(ctx context.Context, file StoredFile) error
	Get(ctx context.Context, id string) (StoredFile, error)
	// RoomIsDM reports whether a room exists and whether it is a direct message,
	// which is what decides if participation has to be checked.
	RoomIsDM(ctx context.Context, roomID string) (isDM bool, exists bool, err error)
	IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error)
}

type postgresRepository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{q: sqlc.New(pool)}
}

func (r *postgresRepository) Save(ctx context.Context, file StoredFile) error {
	return r.q.CreateFile(ctx, sqlc.CreateFileParams{
		ID:        file.ID,
		RoomID:    file.RoomID,
		Uploader:  file.Uploader,
		FileName:  file.FileName,
		Path:      file.Path,
		Hash:      file.Hash,
		Format:    file.Format,
		SizeBytes: file.Size,
	})
}

func (r *postgresRepository) Get(ctx context.Context, id string) (StoredFile, error) {
	row, err := r.q.GetFile(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return StoredFile{}, ErrFileNotFound
		}
		return StoredFile{}, err
	}

	return StoredFile{
		ID:       row.ID,
		RoomID:   row.RoomID,
		Uploader: row.Uploader,
		FileName: row.FileName,
		Path:     row.Path,
		Hash:     row.Hash,
		Format:   row.Format,
		Size:     row.SizeBytes,
	}, nil
}

func (r *postgresRepository) RoomIsDM(ctx context.Context, roomID string) (bool, bool, error) {
	row, err := r.q.GetRoomMetadata(ctx, roomID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, false, nil
		}
		return false, false, err
	}
	return row.IsDm, true, nil
}

func (r *postgresRepository) IsRoomParticipant(ctx context.Context, roomID string, userID string) (bool, error) {
	return r.q.IsRoomParticipant(ctx, sqlc.IsRoomParticipantParams{
		RoomID: roomID,
		UserID: userID,
	})
}
