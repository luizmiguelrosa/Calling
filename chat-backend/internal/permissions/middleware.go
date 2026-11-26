package permissions

import (
	"chat-backend/internal/auth"
	"encoding/json"
	"net/http"
	"strings"
)

// Require rejects a request unless the signed-in user holds the given general
// permission. It assumes auth.Middleware has already populated the context.
func Require(service Service, permission string) func(http.Handler) http.Handler {
	return RequireAny(service, permission)
}

// RequireAny rejects a request unless the user holds at least one of the given
// general permissions. It is the same deny-by-default check as Require, for a
// route reachable from more than one admin category: an operator holding only
// `rooms.create` still needs the room list it sits in.
func RequireAny(service Service, required ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := auth.UserIDFromContext(r.Context())
			if !ok {
				writePermissionError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
				return
			}

			for _, permission := range required {
				allowed, err := service.Can(r.Context(), userID, permission)
				if err != nil {
					writePermissionError(w, http.StatusInternalServerError, err.Error())
					return
				}
				if allowed {
					next.ServeHTTP(w, r)
					return
				}
			}

			writePermissionError(w, http.StatusForbidden, "forbidden: missing permission "+strings.Join(required, "|"))
		})
	}
}

func writePermissionError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}
