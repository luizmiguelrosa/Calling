package user

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Service interface {
	Register(ctx context.Context, input CreateUserInput) (UserResponse, error)
	ValidateCredentials(ctx context.Context, username string, password string) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	ExistsByID(ctx context.Context, id string) (bool, error)
}

type userService struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &userService{repo: repo}
}

func (s *userService) Register(ctx context.Context, input CreateUserInput) (UserResponse, error) {
	username := strings.TrimSpace(input.Username)

	exists, err := s.repo.ExistsByUsername(ctx, username)
	if err != nil {
		return UserResponse{}, err
	}
	if exists {
		return UserResponse{}, ErrUsernameTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return UserResponse{}, err
	}

	u := &User{
		ID:       strconv.FormatInt(time.Now().UnixNano(), 10),
		Username: username,
		Password: string(hash),
		Name:     strings.TrimSpace(input.Name),
		Role:     input.Role,
	}

	if err := s.repo.Create(ctx, u); err != nil {
		return UserResponse{}, err
	}

	return UserResponse{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Role:     u.Role,
	}, nil
}

func (s *userService) ValidateCredentials(ctx context.Context, username string, password string) (*User, error) {
	u, err := s.repo.GetByUsername(ctx, username)
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)); err != nil {
		return nil, errors.New("unauthorized: invalid credentials")
	}

	return u, nil
}

func (s *userService) GetByID(ctx context.Context, id string) (*User, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *userService) ExistsByID(ctx context.Context, id string) (bool, error) {
	return s.repo.ExistsByID(ctx, id)
}
