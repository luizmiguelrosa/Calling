package user

import (
	"chat-backend/internal/database/sqlc"
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUsernameTaken = errors.New("conflict: username already taken")
	ErrUserNotFound  = errors.New("not_found: user does not exist")
)

type Repository interface {
	Create(ctx context.Context, u *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByUsername(ctx context.Context, username string) (*User, error)
	ExistsByID(ctx context.Context, id string) (bool, error)
	ExistsByUsername(ctx context.Context, username string) (bool, error)
}

type postgresRepository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{
		q: sqlc.New(pool),
	}
}

func (r *postgresRepository) Create(ctx context.Context, u *User) error {
	return r.q.CreateUser(ctx, sqlc.CreateUserParams{
		ID:       u.ID,
		Username: u.Username,
		Password: u.Password,
		Name:     u.Name,
		Role:     string(u.Role),
	})
}

func (r *postgresRepository) GetByID(ctx context.Context, id string) (*User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return toUser(row), nil
}

func (r *postgresRepository) GetByUsername(ctx context.Context, username string) (*User, error) {
	row, err := r.q.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return toUser(row), nil
}

func (r *postgresRepository) ExistsByID(ctx context.Context, id string) (bool, error) {
	return r.q.UserExistsByID(ctx, id)
}

func (r *postgresRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	return r.q.UserExistsByUsername(ctx, username)
}

func toUser(row sqlc.User) *User {
	return &User{
		ID:        row.ID,
		Username:  row.Username,
		Password:  row.Password,
		Name:      row.Name,
		Role:      Role(row.Role),
		CreatedAt: row.CreatedAt,
	}
}
