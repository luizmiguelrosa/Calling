package container

import (
	"chat-backend/internal/auth"
	"chat-backend/internal/chat"
	"chat-backend/internal/database"
	"chat-backend/internal/user"
	"context"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/dig"
)

func BuildContainer(ctx context.Context) *dig.Container {
	c := dig.New()

	// Database
	c.Provide(func() (*pgxpool.Pool, error) {
		return database.NewPool(ctx)
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

	// User module
	c.Provide(user.NewRepository)
	c.Provide(user.NewService)
	c.Provide(user.NewHandler)

	// Chat module
	c.Provide(chat.NewRepository)
	c.Provide(chat.NewService)
	c.Provide(chat.NewManager)

	return c
}
