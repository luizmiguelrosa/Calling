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
//
// A browser WebSocket handshake cannot set request headers, so an upgrade is
// also allowed to pass the token as a `?token=` query parameter. That is
// deliberately restricted to the upgrade: query strings end up in proxy and
// access logs, so ordinary HTTP requests still have to use the header.
func Middleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawToken, ok := bearerToken(r)
			if !ok {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"message":"missing Authorization header"}`))
				return
			}

			token, err := jwt.ParseWithClaims(rawToken, &Claims{}, func(token *jwt.Token) (any, error) {
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

// bearerToken extracts the raw JWT from the Authorization header, falling back
// to the `token` query parameter for WebSocket upgrades.
func bearerToken(r *http.Request) (string, bool) {
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return "", false
		}
		return parts[1], true
	}

	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		if token := r.URL.Query().Get("token"); token != "" {
			return token, true
		}
	}

	return "", false
}

// UserIDFromContext retrieves the authenticated user ID from the request context.
// It should only be called after the Middleware has run.
func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDKey).(string)
	return userID, ok
}
