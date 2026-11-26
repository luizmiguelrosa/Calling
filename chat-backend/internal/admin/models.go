package admin

import (
	"time"

	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

// RoleRef is the display role a user holds. A user has exactly one, so it is a
// single value rather than a set.
type RoleRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// GroupRef is a group as an admin row renders it. A user holds a set of them, so
// the UI shows every name with its colour instead of a single label.
type GroupRef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Member is a user inside a group or role member table.
type Member struct {
	ID       string     `json:"id"`
	Username string     `json:"username"`
	Name     string     `json:"name"`
	Email    string     `json:"email"`
	Role     *RoleRef   `json:"role"`
	Groups   []GroupRef `json:"groups"`
}

// User is a row of the admin users table.
type User struct {
	ID        string     `json:"id"`
	Username  string     `json:"username"`
	Email     string     `json:"email"`
	Name      string     `json:"name"`
	Role      *RoleRef   `json:"role"`
	Groups    []GroupRef `json:"groups"`
	CreatedAt time.Time  `json:"created_at"`
}

// Group is a group with its current members and the general permissions granted
// to it. Groups are the permission-bearing entity.
type Group struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
	Members     []Member `json:"members"`
}

// Role is a display-only label with the users that carry it. It grants nothing.
type Role struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Color   string   `json:"color"`
	Members []Member `json:"members"`
}

// RoomPermissionUser is one user's explicit per-room grants.
type RoomPermissionUser struct {
	UserID      string   `json:"user_id"`
	Username    string   `json:"username"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

// RoomPermissionGroup is one group's explicit per-room grants. Membership is
// resolved through `group_members`, so a group grant applies to every member.
type RoomPermissionGroup struct {
	GroupID     string   `json:"group_id"`
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
}

// RoomPermissions is the per-room screen's payload. `open` is true while the
// room has no explicit rows, meaning every authenticated user keeps access.
type RoomPermissions struct {
	Open    bool                  `json:"open"`
	Entries []RoomPermissionUser  `json:"entries"`
	Groups  []RoomPermissionGroup `json:"groups"`
}

// MyPermissions is what the signed-in user may do generally, so the client can
// hide what it cannot use.
type MyPermissions struct {
	Permissions []string `json:"permissions"`
}

// RoomInfo is a public room as the admin room table lists it.
type RoomInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type CreateUserInput struct {
	Username string   `json:"username" validate:"required,min=3,max=32"`
	Password string   `json:"password" validate:"required,min=8,max=72"`
	Name     string   `json:"name" validate:"required,min=2,max=64"`
	Email    string   `json:"email" validate:"required,email,max=254"`
	RoleID   string   `json:"role_id" validate:"required"`
	GroupIDs []string `json:"group_ids" validate:"required,min=1,dive,required"`
}

func (i CreateUserInput) Validate() error { return validate.Struct(i) }

type UpdateUserInput struct {
	Name     string   `json:"name" validate:"required,min=2,max=64"`
	Email    string   `json:"email" validate:"required,email,max=254"`
	RoleID   string   `json:"role_id" validate:"required"`
	GroupIDs []string `json:"group_ids" validate:"required,min=1,dive,required"`
}

func (i UpdateUserInput) Validate() error { return validate.Struct(i) }

type CreateGroupInput struct {
	Name  string `json:"name" validate:"required,min=2,max=32"`
	Color string `json:"color" validate:"required,hexcolor"`
}

func (i CreateGroupInput) Validate() error { return validate.Struct(i) }

// UpdateGroupInput carries both editable fields, so a rename and a colour change
// travel as one request.
type UpdateGroupInput struct {
	Name  string `json:"name" validate:"required,min=2,max=32"`
	Color string `json:"color" validate:"required,hexcolor"`
}

func (i UpdateGroupInput) Validate() error { return validate.Struct(i) }

type CreateRoleInput struct {
	Name  string `json:"name" validate:"required,min=2,max=32"`
	Color string `json:"color" validate:"required,hexcolor"`
}

func (i CreateRoleInput) Validate() error { return validate.Struct(i) }

type UpdateRoleInput struct {
	Name  string `json:"name" validate:"required,min=2,max=32"`
	Color string `json:"color" validate:"required,hexcolor"`
}

func (i UpdateRoleInput) Validate() error { return validate.Struct(i) }

type SetGroupPermissionsInput struct {
	Permissions []string `json:"permissions" validate:"dive,required"`
}

func (i SetGroupPermissionsInput) Validate() error { return validate.Struct(i) }

type SetRoomPermissionsInput struct {
	UserID      string   `json:"user_id"`
	GroupID     string   `json:"group_id"`
	Permissions []string `json:"permissions" validate:"dive,required"`
}

func (i SetRoomPermissionsInput) Validate() error { return validate.Struct(i) }

type RenameRoomInput struct {
	Name string `json:"name" validate:"required,min=3,max=32"`
}

func (i RenameRoomInput) Validate() error { return validate.Struct(i) }
