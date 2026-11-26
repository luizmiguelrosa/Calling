package user

import (
	"chat-backend/internal/database/sqlc"
	"context"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Default bootstrap credentials. They exist so a fresh database has an account
// that can open the admin panel and create the real users; the operator is told
// to replace the password through `PUT /users/me/password` immediately.
const (
	DefaultSystemUsername = "system"
	DefaultSystemPassword = "system1234"
	DefaultSystemName     = "System"
	systemRoleID          = "role-admin"
)

// EnsureSystemUser creates the bootstrap account when the database has no live
// user at all. An existing installation is never touched. It returns whether the
// account was created and its username, so the caller can log the action without
// exposing the password.
func EnsureSystemUser(ctx context.Context, pool *pgxpool.Pool) (bool, string, error) {
	q := sqlc.New(pool)

	live, err := q.LiveUserExists(ctx)
	if err != nil {
		return false, "", err
	}
	if live {
		return false, "", nil
	}

	username := envOr("SYSTEM_USER_USERNAME", DefaultSystemUsername)
	password := envOr("SYSTEM_USER_PASSWORD", DefaultSystemPassword)
	name := envOr("SYSTEM_USER_NAME", DefaultSystemName)

	if len(username) < 3 || len(username) > 32 {
		return false, "", errors.New("system user: SYSTEM_USER_USERNAME must be 3-32 characters")
	}
	if len(password) < 8 || len(password) > 72 {
		return false, "", errors.New("system user: SYSTEM_USER_PASSWORD must be 8-72 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return false, "", err
	}

	// A soft-deleted row still holds the unique username. Reviving it is the
	// recovery path when every live account is gone, and it avoids a unique
	// violation that would otherwise stop the server from starting.
	exists, err := q.UserExistsByUsername(ctx, username)
	if err != nil {
		return false, "", err
	}
	if exists {
		if err := q.ReviveUserByUsername(ctx, sqlc.ReviveUserByUsernameParams{
			Username: username,
			Password: string(hash),
		}); err != nil {
			return false, "", err
		}

		// Reviving must restore admin access, which is the display role;
		// the legacy `users.role` label no longer grants anything.
		revived, err := q.GetUserByUsername(ctx, username)
		if err != nil {
			return false, "", err
		}
		if err := q.SetUserRole(ctx, sqlc.SetUserRoleParams{
			ID:     revived.ID,
			RoleID: pgtype.Text{String: systemRoleID, Valid: true},
		}); err != nil {
			return false, "", err
		}

		log.Printf("deleted system user %q revived with a fresh password.", username)
		return true, username, nil
	}

	id := strconv.FormatInt(time.Now().UnixNano(), 10)
	if err := q.CreateAdminUser(ctx, sqlc.CreateAdminUserParams{
		ID:       id,
		Username: strings.TrimSpace(username),
		Password: string(hash),
		Name:     strings.TrimSpace(name),
		Email:    "",
	}); err != nil {
		return false, "", err
	}
	if err := q.SetUserRole(ctx, sqlc.SetUserRoleParams{
		ID:     id,
		RoleID: pgtype.Text{String: systemRoleID, Valid: true},
	}); err != nil {
		return false, "", err
	}

	if password == DefaultSystemPassword {
		log.Printf("system user %q created with the default password; change it from the account menu before sharing the deployment.", username)
	} else {
		log.Printf("system user %q created from the environment.", username)
	}

	return true, username, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
