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
	List(ctx context.Context) ([]*User, error)
	ExistsByID(ctx context.Context, id string) (bool, error)
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	UpdatePassword(ctx context.Context, id, password string) error
	LiveUserExists(ctx context.Context) (bool, error)
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

	u := &User{
		ID:        row.ID,
		Username:  row.Username,
		Password:  row.Password,
		Name:      row.Name,
		CreatedAt: row.CreatedAt,
	}
	return r.withRoleAndGroups(ctx, u)
}

func (r *postgresRepository) GetByUsername(ctx context.Context, username string) (*User, error) {
	row, err := r.q.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	u := &User{
		ID:        row.ID,
		Username:  row.Username,
		Password:  row.Password,
		Name:      row.Name,
		CreatedAt: row.CreatedAt,
	}
	return r.withRoleAndGroups(ctx, u)
}

func (r *postgresRepository) List(ctx context.Context) ([]*User, error) {
	rows, err := r.q.ListUsers(ctx)
	if err != nil {
		return nil, err
	}

	// The directory query deliberately omits `password`, so it maps to its own
	// row type instead of the full `sqlc.User`.
	users := make([]*User, 0, len(rows))
	for _, row := range rows {
		users = append(users, &User{
			ID:       row.ID,
			Username: row.Username,
			Name:     row.Name,
			Role:     nil,
			Groups:   []GroupRef{},
		})
	}

	if len(users) == 0 {
		return users, nil
	}

	rolesByUser, err := r.allUserRoles(ctx)
	if err != nil {
		return nil, err
	}
	groupsByUser, err := r.allUserGroups(ctx)
	if err != nil {
		return nil, err
	}

	for _, u := range users {
		if role, ok := rolesByUser[u.ID]; ok {
			u.Role = role
		}
		if groups, ok := groupsByUser[u.ID]; ok {
			u.Groups = groups
		}
	}
	return users, nil
}

func (r *postgresRepository) withRoleAndGroups(ctx context.Context, u *User) (*User, error) {
	role, err := r.userRole(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	u.Role = role

	groups, err := r.userGroups(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	u.Groups = groups

	return u, nil
}

func (r *postgresRepository) allUserRoles(ctx context.Context) (map[string]*RoleRef, error) {
	rows, err := r.q.ListAllUserRoles(ctx)
	if err != nil {
		return nil, err
	}

	byUser := make(map[string]*RoleRef)
	for _, row := range rows {
		byUser[row.UserID] = &RoleRef{ID: row.RoleID, Name: row.RoleName, Color: row.RoleColor}
	}
	return byUser, nil
}

func (r *postgresRepository) allUserGroups(ctx context.Context) (map[string][]GroupRef, error) {
	rows, err := r.q.ListAllUserGroups(ctx)
	if err != nil {
		return nil, err
	}

	byUser := make(map[string][]GroupRef)
	for _, row := range rows {
		byUser[row.UserID] = append(byUser[row.UserID], GroupRef{
			ID:    row.GroupID,
			Name:  row.GroupName,
			Color: row.GroupColor,
		})
	}
	return byUser, nil
}

func (r *postgresRepository) userRole(ctx context.Context, userID string) (*RoleRef, error) {
	row, err := r.q.GetUserRole(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &RoleRef{ID: row.ID, Name: row.Name, Color: row.Color}, nil
}

func (r *postgresRepository) userGroups(ctx context.Context, userID string) ([]GroupRef, error) {
	rows, err := r.q.ListUserGroupsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	groups := make([]GroupRef, 0, len(rows))
	for _, row := range rows {
		groups = append(groups, GroupRef{ID: row.ID, Name: row.Name, Color: row.Color})
	}
	return groups, nil
}

func (r *postgresRepository) ExistsByID(ctx context.Context, id string) (bool, error) {
	return r.q.UserExistsByID(ctx, id)
}

func (r *postgresRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	return r.q.UserExistsByUsername(ctx, username)
}

func (r *postgresRepository) UpdatePassword(ctx context.Context, id, password string) error {
	return r.q.UpdateUserPassword(ctx, sqlc.UpdateUserPasswordParams{
		ID:       id,
		Password: password,
	})
}

func (r *postgresRepository) LiveUserExists(ctx context.Context) (bool, error) {
	return r.q.LiveUserExists(ctx)
}
