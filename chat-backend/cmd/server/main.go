package main

import (
	"chat-backend/internal/chat"
	"chat-backend/internal/container"
	"chat-backend/internal/user"
	"context"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	log.Println("Iniciando servidor... 🚀")
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"}, // No futuro, você coloca o endereço do Tauri aqui
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
	}))

	ctx := context.Background()
	depsContainer := container.BuildContainer(ctx)

	err := depsContainer.Invoke(func(managerChat *chat.Manager, userHandler *user.Handler) {
		// User routes
		r.Post("/users", userHandler.Register)
		r.Post("/users/login", userHandler.Login)
		r.Get("/users", userHandler.GetUser)

		// Chat routes
		r.Get("/history", managerChat.GetHistory)
		r.Get("/users/online", managerChat.GetOnlineUsers)
		r.Get("/chat", managerChat.ManageConnection)
		r.Post("/rooms", managerChat.CreateRoom)
		r.Get("/rooms", managerChat.ListRooms)
		r.Post("/rooms/dm", managerChat.CreateDM)
		r.Get("/rooms/dm", managerChat.ListUserDMs)
	})

	if err != nil {
		log.Fatal("Erro crítico ao injetar dependências: ", err)
	}

	port := ":8080"
	log.Printf("Servidor online em http://localhost%s", port)
	if err := http.ListenAndServe(port, r); err != nil {
		log.Fatal("Erro crítico no servidor: ", err)
	}
}
