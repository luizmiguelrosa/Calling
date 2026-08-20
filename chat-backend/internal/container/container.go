package container

import (
	"chat-backend/internal/chat"
	"chat-backend/internal/database"
	"chat-backend/internal/user"
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/dig"
)

func BuildContainer(ctx context.Context) *dig.Container {
	c := dig.New()

	// Database
	c.Provide(func() (*pgxpool.Pool, error) {
		return database.NewPool(ctx)
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
