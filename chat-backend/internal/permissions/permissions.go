package permissions

import (
	"context"
)

// General permission keys. They are granted to a role and checked by the admin
// endpoints and by the client, which uses the same strings to decide what to
// show.
const (
	AdminAll     = "admin.all"
	RoomsCreate  = "rooms.create"
	RoomsEdit    = "rooms.edit"
	RoomsView    = "rooms.view"
	UsersManage  = "users.manage"
	RolesManage  = "roles.manage"
	GroupsManage = "groups.manage"
	RoomView     = "room.view"
	RoomSend     = "room.send"
)

// Definition is one entry of the catalog the admin panel renders.
type Definition struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// Catalog is the fixed set of general permissions. `room.view` and `room.send`
// are per-room and are edited from the room permission screen instead.
var Catalog = []Definition{
	{Key: AdminAll, Label: "Acesso total"},
	{Key: RoomsCreate, Label: "Criar sala pública"},
	{Key: RoomsEdit, Label: "Editar sala pública"},
	{Key: RoomsView, Label: "Ver salas"},
	{Key: UsersManage, Label: "Gerenciar usuários"},
	{Key: RolesManage, Label: "Gerenciar cargos"},
	{Key: GroupsManage, Label: "Gerenciar grupos"},
}

// IsKnownGeneral reports whether a key belongs to the general catalog. It keeps
// an arbitrary string out of the role_permissions table.
func IsKnownGeneral(key string) bool {
	if key == AdminAll {
		return true
	}
	for _, definition := range Catalog {
		if definition.Key == key {
			return true
		}
	}
	return false
}

// IsKnownRoom reports whether a key is a per-room permission.
func IsKnownRoom(key string) bool {
	return key == RoomView || key == RoomSend
}

// Service answers the two authorization questions the app asks: does a user
// hold a general permission, and may a user read or write a public room.
type Service interface {
	Can(ctx context.Context, userID, permission string) (bool, error)
	List(ctx context.Context, userID string) ([]string, error)
	CanViewRoom(ctx context.Context, userID, roomID string) (bool, error)
	CanSendRoom(ctx context.Context, userID, roomID string) (bool, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) Can(ctx context.Context, userID, permission string) (bool, error) {
	if userID == "" {
		return false, nil
	}
	return s.repo.HasPermission(ctx, userID, permission)
}

func (s *service) List(ctx context.Context, userID string) ([]string, error) {
	return s.repo.ListPermissions(ctx, userID)
}

// CanViewRoom treats a room with no explicit permission rows as open, which is
// how public rooms behaved before per-room permissions existed. Once an admin
// grants at least one row, only the granted users keep access; a role holding
// `admin.all` always does.
func (s *service) CanViewRoom(ctx context.Context, userID, roomID string) (bool, error) {
	return s.canRoom(ctx, userID, roomID, RoomView)
}

func (s *service) CanSendRoom(ctx context.Context, userID, roomID string) (bool, error) {
	return s.canRoom(ctx, userID, roomID, RoomSend)
}

func (s *service) canRoom(ctx context.Context, userID, roomID, permission string) (bool, error) {
	if userID == "" {
		return false, nil
	}

	isAdmin, err := s.repo.HasPermission(ctx, userID, AdminAll)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	explicit, err := s.repo.RoomHasExplicitPermissions(ctx, roomID)
	if err != nil {
		return false, err
	}
	if !explicit {
		return true, nil
	}

	return s.repo.HasRoomPermission(ctx, userID, roomID, permission)
}
