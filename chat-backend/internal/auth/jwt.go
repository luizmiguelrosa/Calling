package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenType distinguishes the short-lived access token from the long-lived
// refresh token, so a refresh token cannot be replayed as an access token.
type TokenType string

const (
	TokenTypeAccess  TokenType = "access"
	TokenTypeRefresh TokenType = "refresh"
)

const (
	// AccessTokenTTL is deliberately short; the client silently refreshes.
	AccessTokenTTL = time.Hour
	// RefreshTokenTTL is how long an unused refresh token stays valid.
	RefreshTokenTTL = 7 * 24 * time.Hour
)

type Claims struct {
	UserID    string    `json:"user_id"`
	Username  string    `json:"username"`
	TokenType TokenType `json:"token_type"`
	jwt.RegisteredClaims
}

func generateToken(secret []byte, userID, username string, tokenType TokenType, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Username:  username,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// GenerateTokenPair issues a fresh access/refresh pair. Both login and the
// refresh endpoint return a pair, so the client always rotates its tokens.
func GenerateTokenPair(secret []byte, userID, username string) (accessToken, refreshToken string, err error) {
	accessToken, err = generateToken(secret, userID, username, TokenTypeAccess, AccessTokenTTL)
	if err != nil {
		return "", "", err
	}

	refreshToken, err = generateToken(secret, userID, username, TokenTypeRefresh, RefreshTokenTTL)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// ParseToken validates a signed token and returns its claims.
func ParseToken(secret []byte, rawToken string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(rawToken, &Claims{}, func(token *jwt.Token) (any, error) {
		return secret, nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired token")
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}
