package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userIDKey contextKey = "userID"

// Middleware validates the JWT from the Authorization header and stores the
// user ID in the request context. Requests without a valid token receive a
// 401 Unauthorized response.
func Middleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"message":"missing Authorization header"}`))
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"message":"invalid Authorization header format"}`))
				return
			}

			token, err := jwt.ParseWithClaims(parts[1], &Claims{}, func(token *jwt.Token) (any, error) {
				return secret, nil
			})
			if err != nil || !token.Valid {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"message":"invalid or expired token"}`))
				return
			}

			claims, ok := token.Claims.(*Claims)
			if !ok {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"message":"invalid token claims"}`))
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext retrieves the authenticated user ID from the request context.
// It should only be called after the Middleware has run.
func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDKey).(string)
	return userID, ok
}
