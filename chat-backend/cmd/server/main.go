package main

import (
	"chat-backend/internal/admin"
	"chat-backend/internal/chat"
	"chat-backend/internal/container"
	"chat-backend/internal/files"
	"chat-backend/internal/permissions"
	"chat-backend/internal/user"
	"context"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	log.Println("Starting server")
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"}, // Replace with the Tauri origin for a production deployment.
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type", "Authorization"},
	}))

	ctx := context.Background()
	depsContainer := container.BuildContainer(ctx)

	err := depsContainer.Invoke(func(
		managerChat *chat.Manager,
		userHandler *user.Handler,
		filesHandler *files.Handler,
		adminHandler *admin.Handler,
		permissionService permissions.Service,
		authMiddleware func(http.Handler) http.Handler,
	) {
		// Public routes. Accounts are created from the admin panel, so there is no
		// self-registration endpoint.
		r.Post("/users/login", userHandler.Login)
		r.Post("/users/refresh", userHandler.Refresh)

		// Protected routes (require valid JWT)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware)
			r.Get("/users", userHandler.GetUser)
			r.Put("/users/me/password", userHandler.ChangePassword)
			r.Get("/me/permissions", adminHandler.GetMyPermissions)
			// Selectors need the role names and colours without the
			// member/permission payload; this is readable by any signed-in user.
			r.Get("/roles", adminHandler.ListRoleOptions)
			// Group roster for @group: mentions and autocomplete.
			r.Get("/groups", adminHandler.ListGroupOptions)
			r.Get("/history", managerChat.GetHistory)
			r.Get("/messages/{id}", managerChat.GetMessage)
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

			// Administration. Each category has its own permission, so a group
			// holding only one of them reaches only that part of the panel.
			r.Route("/admin", func(r chi.Router) {
				r.With(permissions.Require(permissionService, permissions.UsersManage)).Get("/users", adminHandler.ListUsers)
				r.With(permissions.Require(permissionService, permissions.UsersManage)).Post("/users", adminHandler.CreateUser)
				r.With(permissions.Require(permissionService, permissions.UsersManage)).Put("/users/{id}", adminHandler.UpdateUser)
				r.With(permissions.Require(permissionService, permissions.UsersManage)).Delete("/users/{id}", adminHandler.DeleteUser)

				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Get("/groups", adminHandler.ListGroups)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Get("/groups/{id}", adminHandler.GetGroup)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Post("/groups", adminHandler.CreateGroup)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Put("/groups/{id}", adminHandler.UpdateGroup)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Delete("/groups/{id}", adminHandler.DeleteGroup)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Delete("/groups/{id}/members/{userId}", adminHandler.RemoveGroupMember)
				r.With(permissions.Require(permissionService, permissions.GroupsManage)).Put("/groups/{id}/permissions", adminHandler.SetGroupPermissions)

				r.With(permissions.Require(permissionService, permissions.RolesManage)).Get("/roles", adminHandler.ListRoles)
				r.With(permissions.Require(permissionService, permissions.RolesManage)).Get("/roles/{id}", adminHandler.GetRole)
				r.With(permissions.Require(permissionService, permissions.RolesManage)).Post("/roles", adminHandler.CreateRole)
				r.With(permissions.Require(permissionService, permissions.RolesManage)).Put("/roles/{id}", adminHandler.UpdateRole)
				r.With(permissions.Require(permissionService, permissions.RolesManage)).Delete("/roles/{id}", adminHandler.DeleteRole)

				// The rooms category is also where a public room is created, so a
				// group holding only `rooms.create` can reach the list behind it.
				// The permissions payload stays behind rooms.view/rooms.edit,
				// because creation does not need to know who may already read it.
				r.With(permissions.RequireAny(permissionService, permissions.RoomsView, permissions.RoomsEdit, permissions.RoomsCreate)).Get("/rooms", adminHandler.ListRooms)
				r.With(permissions.RequireAny(permissionService, permissions.RoomsView, permissions.RoomsEdit)).Get("/rooms/{id}/permissions", adminHandler.GetRoomPermissions)
				r.With(permissions.Require(permissionService, permissions.RoomsEdit)).Put("/rooms/{id}", adminHandler.UpdateRoom)
				r.With(permissions.Require(permissionService, permissions.RoomsEdit)).Put("/rooms/{id}/permissions", adminHandler.SetRoomPermissions)

				r.With(permissions.Require(permissionService, permissions.RolesManage)).Get("/permissions", adminHandler.PermissionCatalog)
			})
		})
	})

	if err != nil {
		log.Fatal("Fatal error injecting dependencies: ", err)
	}

	port := ":8080"
	log.Printf("Server listening on http://localhost%s", port)
	if err := http.ListenAndServe(port, r); err != nil {
		log.Fatal("Fatal server error: ", err)
	}
}
