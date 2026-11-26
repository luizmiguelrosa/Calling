package permissions

import (
	"chat-backend/internal/database/sqlc"
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	HasPermission(ctx context.Context, userID, permission string) (bool, error)
	ListPermissions(ctx context.Context, userID string) ([]string, error)
	RoomHasExplicitPermissions(ctx context.Context, roomID string) (bool, error)
	HasRoomPermission(ctx context.Context, userID, roomID, permission string) (bool, error)
}

type postgresRepository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{q: sqlc.New(pool)}
}

func (r *postgresRepository) HasPermission(ctx context.Context, userID, permission string) (bool, error) {
	return r.q.UserHasPermission(ctx, sqlc.UserHasPermissionParams{
		UserID:     userID,
		Permission: permission,
	})
}

func (r *postgresRepository) ListPermissions(ctx context.Context, userID string) ([]string, error) {
	return r.q.ListUserPermissions(ctx, userID)
}

func (r *postgresRepository) RoomHasExplicitPermissions(ctx context.Context, roomID string) (bool, error) {
	result, err := r.q.RoomHasExplicitPermissions(ctx, roomID)
	if err != nil {
		return false, err
	}
	return result.Bool, nil
}

func (r *postgresRepository) HasRoomPermission(ctx context.Context, userID, roomID, permission string) (bool, error) {
	result, err := r.q.UserHasRoomPermission(ctx, sqlc.UserHasRoomPermissionParams{
		UserID:     userID,
		RoomID:     roomID,
		Permission: permission,
	})
	if err != nil {
		return false, err
	}
	return result.Bool, nil
}
