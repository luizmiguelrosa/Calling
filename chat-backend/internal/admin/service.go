package admin

import (
	"chat-backend/internal/permissions"
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Service is the admin surface: users, groups, roles, rooms and the per-room
// permission map. Soft deletion is applied here so every query below the service
// only sees live rows.
type Service interface {
	ListUsers(ctx context.Context) ([]User, error)
	CreateUser(ctx context.Context, input CreateUserInput) (User, error)
	UpdateUser(ctx context.Context, id string, input UpdateUserInput) (User, error)
	DeleteUser(ctx context.Context, actorID, id string) error

	ListGroups(ctx context.Context) ([]Group, error)
	GetGroup(ctx context.Context, id string) (Group, error)
	CreateGroup(ctx context.Context, input CreateGroupInput) (Group, error)
	UpdateGroup(ctx context.Context, id string, input UpdateGroupInput) (Group, error)
	DeleteGroup(ctx context.Context, id string) error
	RemoveGroupMember(ctx context.Context, groupID, userID string) error
	SetGroupPermissions(ctx context.Context, groupID string, input SetGroupPermissionsInput) ([]string, error)

	ListRoles(ctx context.Context) ([]Role, error)
	GetRole(ctx context.Context, id string) (Role, error)
	CreateRole(ctx context.Context, input CreateRoleInput) (Role, error)
	UpdateRole(ctx context.Context, id string, input UpdateRoleInput) (Role, error)
	DeleteRole(ctx context.Context, id string) error

	ListRooms(ctx context.Context) ([]RoomInfo, error)
	RenameRoom(ctx context.Context, id string, input RenameRoomInput) (RoomInfo, error)
	GetRoomPermissions(ctx context.Context, roomID string) (RoomPermissions, error)
	SetRoomPermissions(ctx context.Context, roomID string, input SetRoomPermissionsInput) error
}

type adminService struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &adminService{repo: repo}
}

func (s *adminService) ListUsers(ctx context.Context) ([]User, error) {
	return s.repo.ListUsers(ctx)
}

func (s *adminService) CreateUser(ctx context.Context, input CreateUserInput) (User, error) {
	username := strings.TrimSpace(input.Username)
	name := strings.TrimSpace(input.Name)
	email := strings.TrimSpace(input.Email)

	exists, err := s.repo.UsernameExists(ctx, username)
	if err != nil {
		return User{}, err
	}
	if exists {
		return User{}, errors.New("conflict: username already taken")
	}

	roleID, err := s.validateRole(ctx, input.RoleID)
	if err != nil {
		return User{}, err
	}
	groupIDs, err := s.validateGroups(ctx, input.GroupIDs)
	if err != nil {
		return User{}, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}

	id := newID()
	if err := s.repo.CreateUser(ctx, id, username, string(hash), name, email); err != nil {
		return User{}, err
	}

	if err := s.repo.SetUserRole(ctx, id, roleID); err != nil {
		return User{}, err
	}
	if err := s.repo.ReplaceUserGroups(ctx, id, groupIDs); err != nil {
		return User{}, err
	}

	return s.repo.GetUser(ctx, id)
}

func (s *adminService) UpdateUser(ctx context.Context, id string, input UpdateUserInput) (User, error) {
	if _, err := s.repo.GetUser(ctx, id); err != nil {
		return User{}, errors.New("not_found: user does not exist")
	}

	roleID, err := s.validateRole(ctx, input.RoleID)
	if err != nil {
		return User{}, err
	}
	groupIDs, err := s.validateGroups(ctx, input.GroupIDs)
	if err != nil {
		return User{}, err
	}

	name := strings.TrimSpace(input.Name)
	email := strings.TrimSpace(input.Email)
	if err := s.repo.UpdateUser(ctx, id, name, email); err != nil {
		return User{}, err
	}

	if err := s.repo.SetUserRole(ctx, id, roleID); err != nil {
		return User{}, err
	}

	// Groups are a set, so the edit replaces the membership list wholesale.
	if err := s.repo.ReplaceUserGroups(ctx, id, groupIDs); err != nil {
		return User{}, err
	}

	return s.repo.GetUser(ctx, id)
}

func (s *adminService) DeleteUser(ctx context.Context, actorID, id string) error {
	if actorID == id {
		return errors.New("invalid: you cannot remove your own account")
	}
	if _, err := s.repo.GetUser(ctx, id); err != nil {
		return errors.New("not_found: user does not exist")
	}
	return s.repo.SoftDeleteUser(ctx, id)
}

func (s *adminService) ListGroups(ctx context.Context) ([]Group, error) {
	return s.repo.ListGroups(ctx)
}

func (s *adminService) GetGroup(ctx context.Context, id string) (Group, error) {
	return s.group(ctx, id)
}

func (s *adminService) CreateGroup(ctx context.Context, input CreateGroupInput) (Group, error) {
	name := strings.TrimSpace(input.Name)

	exists, err := s.repo.GroupNameExists(ctx, name, "")
	if err != nil {
		return Group{}, err
	}
	if exists {
		return Group{}, errors.New("conflict: group name already exists")
	}

	id := newID()
	if err := s.repo.CreateGroup(ctx, id, name, input.Color); err != nil {
		return Group{}, err
	}

	return Group{ID: id, Name: name, Color: input.Color, Permissions: []string{}, Members: []Member{}}, nil
}

func (s *adminService) UpdateGroup(ctx context.Context, id string, input UpdateGroupInput) (Group, error) {
	if _, err := s.repo.GetGroup(ctx, id); err != nil {
		return Group{}, errors.New("not_found: group does not exist")
	}

	name := strings.TrimSpace(input.Name)
	exists, err := s.repo.GroupNameExists(ctx, name, id)
	if err != nil {
		return Group{}, err
	}
	if exists {
		return Group{}, errors.New("conflict: group name already exists")
	}

	if err := s.repo.UpdateGroup(ctx, id, name, input.Color); err != nil {
		return Group{}, err
	}

	return s.group(ctx, id)
}

func (s *adminService) DeleteGroup(ctx context.Context, id string) error {
	if _, err := s.repo.GetGroup(ctx, id); err != nil {
		return errors.New("not_found: group does not exist")
	}

	// Membership rows stay; the live-group joins stop resolving them, which is
	// what makes the admin table render a user with no groups.
	return s.repo.SoftDeleteGroup(ctx, id)
}

func (s *adminService) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	if _, err := s.repo.GetGroup(ctx, groupID); err != nil {
		return errors.New("not_found: group does not exist")
	}
	return s.repo.RemoveGroupMember(ctx, groupID, userID)
}

func (s *adminService) SetGroupPermissions(ctx context.Context, groupID string, input SetGroupPermissionsInput) ([]string, error) {
	if _, err := s.repo.GetGroup(ctx, groupID); err != nil {
		return nil, errors.New("not_found: group does not exist")
	}

	permissions := uniquePermissions(input.Permissions)
	for _, permission := range permissions {
		if !permissionspkgKnown(permission) {
			return nil, errors.New("invalid: unknown permission " + permission)
		}
	}

	if err := s.repo.ReplaceGroupPermissions(ctx, groupID, permissions); err != nil {
		return nil, err
	}
	return permissions, nil
}

func (s *adminService) ListRoles(ctx context.Context) ([]Role, error) {
	return s.repo.ListRoles(ctx)
}

func (s *adminService) GetRole(ctx context.Context, id string) (Role, error) {
	return s.role(ctx, id)
}

func (s *adminService) CreateRole(ctx context.Context, input CreateRoleInput) (Role, error) {
	name := strings.TrimSpace(input.Name)

	exists, err := s.repo.RoleNameExists(ctx, name, "")
	if err != nil {
		return Role{}, err
	}
	if exists {
		return Role{}, errors.New("conflict: role name already exists")
	}

	id := newID()
	if err := s.repo.CreateRole(ctx, id, name, input.Color); err != nil {
		return Role{}, err
	}

	return Role{ID: id, Name: name, Color: input.Color, Members: []Member{}}, nil
}

func (s *adminService) UpdateRole(ctx context.Context, id string, input UpdateRoleInput) (Role, error) {
	if _, err := s.repo.GetRole(ctx, id); err != nil {
		return Role{}, errors.New("not_found: role does not exist")
	}

	name := strings.TrimSpace(input.Name)
	exists, err := s.repo.RoleNameExists(ctx, name, id)
	if err != nil {
		return Role{}, err
	}
	if exists {
		return Role{}, errors.New("conflict: role name already exists")
	}

	if err := s.repo.UpdateRole(ctx, id, name, input.Color); err != nil {
		return Role{}, err
	}

	return s.role(ctx, id)
}

func (s *adminService) DeleteRole(ctx context.Context, id string) error {
	if _, err := s.repo.GetRole(ctx, id); err != nil {
		return errors.New("not_found: role does not exist")
	}

	// The role is a display label: soft-deleting it leaves the users that carried
	// it with no role, which the UI renders as "Cargo desconhecido".
	return s.repo.SoftDeleteRole(ctx, id)
}

func (s *adminService) ListRooms(ctx context.Context) ([]RoomInfo, error) {
	return s.repo.ListPublicRooms(ctx)
}

func (s *adminService) RenameRoom(ctx context.Context, id string, input RenameRoomInput) (RoomInfo, error) {
	name := strings.TrimSpace(input.Name)

	exists, err := s.repo.RoomNameExists(ctx, name, id)
	if err != nil {
		return RoomInfo{}, err
	}
	if exists {
		return RoomInfo{}, errors.New("conflict: room name already exists")
	}

	if err := s.repo.RenameRoom(ctx, id, name); err != nil {
		return RoomInfo{}, err
	}
	return RoomInfo{ID: id, Name: name}, nil
}

func (s *adminService) GetRoomPermissions(ctx context.Context, roomID string) (RoomPermissions, error) {
	open, err := s.repo.RoomHasExplicitPermissions(ctx, roomID)
	if err != nil {
		return RoomPermissions{}, err
	}

	rows, err := s.repo.RoomPermissionRows(ctx, roomID)
	if err != nil {
		return RoomPermissions{}, err
	}
	groupRows, err := s.repo.RoomGroupPermissionRows(ctx, roomID)
	if err != nil {
		return RoomPermissions{}, err
	}

	// Every live user and group is listed, even without a grant, so the room
	// screen can grant a permission without a second directory request.
	users, err := s.repo.ListUsers(ctx)
	if err != nil {
		return RoomPermissions{}, err
	}
	groups, err := s.repo.ListGroups(ctx)
	if err != nil {
		return RoomPermissions{}, err
	}

	entries := make([]RoomPermissionUser, 0, len(users))
	byUser := make(map[string]int, len(users))
	for _, user := range users {
		byUser[user.ID] = len(entries)
		entries = append(entries, RoomPermissionUser{
			UserID:      user.ID,
			Username:    user.Username,
			Name:        user.Name,
			Permissions: []string{},
		})
	}

	for _, row := range rows {
		if index, ok := byUser[row.UserID]; ok {
			entries[index].Permissions = append(entries[index].Permissions, row.Permission)
		}
	}

	groupEntries := make([]RoomPermissionGroup, 0, len(groups))
	byGroup := make(map[string]int, len(groups))
	for _, group := range groups {
		byGroup[group.ID] = len(groupEntries)
		groupEntries = append(groupEntries, RoomPermissionGroup{
			GroupID:     group.ID,
			Name:        group.Name,
			Color:       group.Color,
			Permissions: []string{},
		})
	}

	for _, row := range groupRows {
		if index, ok := byGroup[row.GroupID]; ok {
			groupEntries[index].Permissions = append(groupEntries[index].Permissions, row.Permission)
		}
	}

	return RoomPermissions{Open: !open, Entries: entries, Groups: groupEntries}, nil
}

func (s *adminService) SetRoomPermissions(ctx context.Context, roomID string, input SetRoomPermissionsInput) error {
	rooms, err := s.repo.ListPublicRooms(ctx)
	if err != nil {
		return err
	}
	found := false
	for _, room := range rooms {
		if room.ID == roomID {
			found = true
			break
		}
	}
	if !found {
		return errors.New("not_found: room does not exist")
	}

	// Exactly one subject: a grant belongs to a user or to a group, never both.
	if (input.UserID == "") == (input.GroupID == "") {
		return errors.New("invalid: provide either user_id or group_id")
	}

	granted := uniquePermissions(input.Permissions)
	for _, permission := range granted {
		if !permissionspkgKnownRoom(permission) {
			return errors.New("invalid: unknown room permission " + permission)
		}
	}

	if input.UserID != "" {
		if exists, err := s.repo.UserExists(ctx, input.UserID); err != nil {
			return err
		} else if !exists {
			return errors.New("not_found: user does not exist")
		}
		return s.repo.ReplaceRoomPermissionsForUser(ctx, roomID, input.UserID, granted)
	}

	if _, err := s.repo.GetGroup(ctx, input.GroupID); err != nil {
		return errors.New("not_found: group does not exist")
	}
	return s.repo.ReplaceRoomGroupPermissionsForGroup(ctx, roomID, input.GroupID, granted)
}

// validateRole resolves the single display role a user carries. It is required,
// so a user is never created without a label.
func (s *adminService) validateRole(ctx context.Context, roleID string) (string, error) {
	if strings.TrimSpace(roleID) == "" {
		return "", errors.New("invalid: a role is required")
	}
	if _, err := s.repo.GetRole(ctx, roleID); err != nil {
		return "", errors.New("not_found: role does not exist")
	}
	return roleID, nil
}

// validateGroups resolves every requested group and drops duplicates. At least
// one group is required, so a user is never created without a grouping.
func (s *adminService) validateGroups(ctx context.Context, groupIDs []string) ([]string, error) {
	unique := make([]string, 0, len(groupIDs))
	seen := make(map[string]struct{}, len(groupIDs))
	for _, groupID := range groupIDs {
		if groupID == "" {
			continue
		}
		if _, err := s.repo.GetGroup(ctx, groupID); err != nil {
			return nil, errors.New("not_found: group does not exist")
		}
		if _, ok := seen[groupID]; ok {
			continue
		}
		seen[groupID] = struct{}{}
		unique = append(unique, groupID)
	}

	if len(unique) == 0 {
		return nil, errors.New("invalid: at least one group is required")
	}
	return unique, nil
}

func (s *adminService) group(ctx context.Context, id string) (Group, error) {
	groups, err := s.repo.ListGroups(ctx)
	if err != nil {
		return Group{}, err
	}
	for _, group := range groups {
		if group.ID == id {
			return group, nil
		}
	}
	return Group{}, errors.New("not_found: group does not exist")
}

func (s *adminService) role(ctx context.Context, id string) (Role, error) {
	roles, err := s.repo.ListRoles(ctx)
	if err != nil {
		return Role{}, err
	}
	for _, role := range roles {
		if role.ID == id {
			return role, nil
		}
	}
	return Role{}, errors.New("not_found: role does not exist")
}

func newID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 10)
}

func uniquePermissions(input []string) []string {
	seen := make(map[string]struct{}, len(input))
	result := make([]string, 0, len(input))
	for _, value := range input {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

// Thin wrappers keep the service free of a direct naming collision with the
// permissions package's own types.
func permissionspkgKnown(key string) bool {
	return permissions.IsKnownGeneral(key)
}

func permissionspkgKnownRoom(key string) bool {
	return permissions.IsKnownRoom(key)
}
