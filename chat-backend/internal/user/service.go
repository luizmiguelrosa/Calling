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
	List(ctx context.Context) ([]UserResponse, error)
	ExistsByID(ctx context.Context, id string) (bool, error)
	ChangePassword(ctx context.Context, id, currentPassword, newPassword string) error
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
		Role:     nil,
		Groups:   []GroupRef{},
	}

	if err := s.repo.Create(ctx, u); err != nil {
		return UserResponse{}, err
	}

	return response(u), nil
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

func (s *userService) List(ctx context.Context) ([]UserResponse, error) {
	users, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	responses := make([]UserResponse, 0, len(users))
	for _, u := range users {
		responses = append(responses, response(u))
	}
	return responses, nil
}

func (s *userService) ExistsByID(ctx context.Context, id string) (bool, error) {
	return s.repo.ExistsByID(ctx, id)
}

// ChangePassword verifies the current password before replacing it. An incorrect
// current password is reported as unauthorized, not as a validation failure, so
// the caller can tell a wrong password apart from a malformed request.
func (s *userService) ChangePassword(ctx context.Context, id, currentPassword, newPassword string) error {
	u, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(currentPassword)); err != nil {
		return errors.New("unauthorized: current password is incorrect")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.repo.UpdatePassword(ctx, id, string(hash))
}
