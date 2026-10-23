package main

import (
	"chat-backend/internal/chat"
	"chat-backend/internal/container"
	"chat-backend/internal/files"
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
		AllowedHeaders: []string{"Accept", "Content-Type", "Authorization"},
	}))

	ctx := context.Background()
	depsContainer := container.BuildContainer(ctx)

	err := depsContainer.Invoke(func(
		managerChat *chat.Manager,
		userHandler *user.Handler,
		filesHandler *files.Handler,
		authMiddleware func(http.Handler) http.Handler,
	) {
		// Public routes
		r.Post("/users", userHandler.Register)
		r.Post("/users/login", userHandler.Login)
		r.Post("/users/refresh", userHandler.Refresh)

		// Protected routes (require valid JWT)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware)
			r.Get("/users", userHandler.GetUser)
			r.Get("/history", managerChat.GetHistory)
			r.Get("/users/online", managerChat.GetOnlineUsers)
			r.Post("/rooms", managerChat.CreateRoom)
			r.Get("/rooms", managerChat.ListRooms)
			r.Post("/rooms/dm", managerChat.CreateDM)
			r.Get("/rooms/dm", managerChat.ListUserDMs)
			r.Get("/chat", managerChat.ManageConnection)

			// Batch message sending.
			r.Post("/messages/batch", managerChat.SendBatchMessages)

			// Room images: upload into the room's directory, download under an
			// access check that only lets participants of the room through.
			r.Post("/rooms/{room_id}/files", filesHandler.UploadRoomFile)
			r.Get("/files/rooms/{room_id}/{file}", filesHandler.ServeRoomFile)

			// Profile photos: converted to a fixed-size JPEG on upload, readable
			// by any signed-in user.
			r.Post("/users/me/photo", filesHandler.UploadProfilePhoto)
			r.Get("/files/users/{file}", filesHandler.ServeProfilePhoto)
		})
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
