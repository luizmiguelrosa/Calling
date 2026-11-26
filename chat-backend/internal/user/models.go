package user

import "time"

// RoleRef is the display role a user carries. A user has exactly one, so it is a
// single value rather than a set, and it grants nothing.
type RoleRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// GroupRef is one group a user belongs to. A user may hold several, and the
// colour is what the client uses for the group chip.
type GroupRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type User struct {
	ID        string     `json:"id"`
	Username  string     `json:"username"`
	Password  string     `json:"-"`
	Name      string     `json:"name"`
	Role      *RoleRef   `json:"role"`
	Groups    []GroupRef `json:"groups"`
	CreatedAt time.Time  `json:"created_at"`
}

type CreateUserInput struct {
	Username string `json:"username" validate:"required,min=3,max=32"`
	Password string `json:"password" validate:"required,min=8,max=72"`
	Name     string `json:"name" validate:"required,min=2,max=64"`
}

type LoginInput struct {
	Username string `json:"username" validate:"required,min=3,max=32"`
	Password string `json:"password" validate:"required,min=8,max=72"`
}

// ChangePasswordInput is a self-service password change. The current password is
// required so possession of an already-open session is not enough to take the
// account over.
type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8,max=72"`
}

type UserResponse struct {
	ID       string     `json:"id"`
	Username string     `json:"username"`
	Name     string     `json:"name"`
	Role     *RoleRef   `json:"role"`
	Groups   []GroupRef `json:"groups"`
}

// response projects a domain user onto the shape the API returns, keeping an
// empty group set as `[]` rather than `null`.
func response(u *User) UserResponse {
	groups := u.Groups
	if groups == nil {
		groups = []GroupRef{}
	}
	return UserResponse{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Role:     u.Role,
		Groups:   groups,
	}
}
