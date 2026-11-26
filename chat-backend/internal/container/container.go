package container

import (
	"chat-backend/internal/admin"
	"chat-backend/internal/auth"
	"chat-backend/internal/chat"
	"chat-backend/internal/database"
	"chat-backend/internal/files"
	"chat-backend/internal/permissions"
	"chat-backend/internal/storage"
	"chat-backend/internal/user"
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/dig"
)

func BuildContainer(ctx context.Context) *dig.Container {
	c := dig.New()

	// Database. The schema is applied here rather than relying only on the
	// container's init script: that script runs once, when the volume is first
	// created, so a database that predates a table or column would never get it —
	// which is what produced `relation "files" does not exist`.
	c.Provide(func() (*pgxpool.Pool, error) {
		pool, err := database.NewPool(ctx)
		if err != nil {
			return nil, err
		}

		if err := database.EnsureSchema(ctx, pool); err != nil {
			pool.Close()
			return nil, err
		}

		// A fresh database has no account and no way to create one, because the
		// public registration endpoint is gone. The bootstrap account is created
		// only while every user row is absent or soft-deleted.
		if created, username, err := user.EnsureSystemUser(ctx, pool); err != nil {
			pool.Close()
			return nil, err
		} else if created {
			log.Printf("Bootstrap system user %q is ready to create accounts.", username)
		}

		return pool, nil
	})

	// Auth secret for JWT signing (HS256).
	c.Provide(func() []byte {
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			secret = "dev-secret-change-me"
		}
		return []byte(secret)
	})

	// JWT middleware (validates Bearer tokens and populates the request context).
	c.Provide(func(secret []byte) func(http.Handler) http.Handler {
		return auth.Middleware(secret)
	})

	// File storage. The root directory is configurable so a deployment can put
	// uploads on a dedicated volume.
	c.Provide(func() (*storage.Storage, error) {
		return storage.New(os.Getenv("FILES_DIR"))
	})

	// Permissions module
	c.Provide(permissions.NewRepository)
	c.Provide(permissions.NewService)

	// Admin module (users, roles, rooms, room permissions)
	c.Provide(admin.NewRepository)
	c.Provide(admin.NewService)
	c.Provide(admin.NewHandler)

	// User module
	c.Provide(user.NewRepository)
	c.Provide(user.NewService)
	c.Provide(user.NewHandler)

	// Files module
	c.Provide(files.NewRepository)
	c.Provide(files.NewService)
	c.Provide(files.NewHandler)

	// Chat module
	c.Provide(chat.NewRepository)
	c.Provide(chat.NewService)
	c.Provide(chat.NewManager)

	return c
}
