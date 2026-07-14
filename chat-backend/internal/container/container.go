package container

import (
	"chat-backend/internal/chat"

	"go.uber.org/dig"
)

func BuildContainer() *dig.Container {
	c := dig.New()

	// Registering Chat module dependencies
	c.Provide(chat.NewRepository)
	c.Provide(chat.NewService)
	c.Provide(chat.NewManager)

	return c
}
