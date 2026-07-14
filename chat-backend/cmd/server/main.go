package main

import (
	"chat-backend/internal/chat"
	"chat-backend/internal/container"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	log.Println("Iniciando servidor híbrido modular... 🚀")
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"}, // No futuro, você coloca o endereço do Tauri aqui
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
	}))

	depsContainer := container.BuildContainer()

	err := depsContainer.Invoke(func(managerChat *chat.Manager) {
		r.Get("/historico", managerChat.GetHistory)
		r.Get("/onlineUsers", managerChat.GetOnlineUsers)
		r.Get("/chat", managerChat.ManageConnection)
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
