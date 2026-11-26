package admin

import (
	"chat-backend/internal/database/sqlc"
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RoomPermissionRow is one explicit user grant, before it is grouped per user.
type RoomPermissionRow struct {
	UserID     string
	Username   string
	Name       string
	Permission string
}

// RoomGroupPermissionRow is one explicit group grant, before grouping per group.
type RoomGroupPermissionRow struct {
	GroupID    string
	Name       string
	Color      string
	Permission string
}

// Repository is the admin persistence boundary. It hides the generated rows and
// the nullable-column plumbing from the service.
type Repository interface {
	// Users
	ListUsers(ctx context.Context) ([]User, error)
	GetUser(ctx context.Context, id string) (User, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
	UserExists(ctx context.Context, id string) (bool, error)
	CreateUser(ctx context.Context, id, username, password, name, email string) error
	UpdateUser(ctx context.Context, id, name, email string) error
	SoftDeleteUser(ctx context.Context, id string) error
	SetUserRole(ctx context.Context, userID, roleID string) error
	ReplaceUserGroups(ctx context.Context, userID string, groupIDs []string) error

	// Groups
	ListGroups(ctx context.Context) ([]Group, error)
	GetGroup(ctx context.Context, id string) (GroupRef, error)
	GroupNameExists(ctx context.Context, name string, excludeID string) (bool, error)
	CreateGroup(ctx context.Context, id, name, color string) error
	UpdateGroup(ctx context.Context, id, name, color string) error
	SoftDeleteGroup(ctx context.Context, id string) error
	RemoveGroupMember(ctx context.Context, groupID, userID string) error
	ListGroupPermissions(ctx context.Context, groupID string) ([]string, error)
	ReplaceGroupPermissions(ctx context.Context, groupID string, permissions []string) error

	// Roles (display-only)
	ListRoles(ctx context.Context) ([]Role, error)
	GetRole(ctx context.Context, id string) (RoleRef, error)
	RoleNameExists(ctx context.Context, name string, excludeID string) (bool, error)
	CreateRole(ctx context.Context, id, name, color string) error
	UpdateRole(ctx context.Context, id, name, color string) error
	SoftDeleteRole(ctx context.Context, id string) error

	// Rooms
	ListPublicRooms(ctx context.Context) ([]RoomInfo, error)
	RenameRoom(ctx context.Context, id, name string) error
	RoomNameExists(ctx context.Context, name string, excludeID string) (bool, error)
	RoomHasExplicitPermissions(ctx context.Context, roomID string) (bool, error)
	RoomPermissionRows(ctx context.Context, roomID string) ([]RoomPermissionRow, error)
	ReplaceRoomPermissionsForUser(ctx context.Context, roomID, userID string, permissions []string) error
	RoomGroupPermissionRows(ctx context.Context, roomID string) ([]RoomGroupPermissionRow, error)
	ReplaceRoomGroupPermissionsForGroup(ctx context.Context, roomID, groupID string, permissions []string) error
}

// RoomInfo is defined in models.go; the repository returns it as-is.

type postgresRepository struct {
	q *sqlc.Queries
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &postgresRepository{q: sqlc.New(pool)}
}

func (r *postgresRepository) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := r.q.ListAdminUsers(ctx)
	if err != nil {
		return nil, err
	}

	groupsByUser, err := r.allUserGroups(ctx)
	if err != nil {
		return nil, err
	}
	rolesByUser, err := r.allUserRoles(ctx)
	if err != nil {
		return nil, err
	}

	users := make([]User, 0, len(rows))
	for _, row := range rows {
		groups := groupsByUser[row.ID]
		if groups == nil {
			groups = []GroupRef{}
		}

		users = append(users, User{
			ID:        row.ID,
			Username:  row.Username,
			Email:     row.Email,
			Name:      row.Name,
			Role:      rolesByUser[row.ID],
			Groups:    groups,
			CreatedAt: row.CreatedAt,
		})
	}
	return users, nil
}

func (r *postgresRepository) GetUser(ctx context.Context, id string) (User, error) {
	row, err := r.q.GetAdminUser(ctx, id)
	if err != nil {
		return User{}, err
	}

	role, err := r.userRole(ctx, row.ID)
	if err != nil {
		return User{}, err
	}
	groups, err := r.userGroups(ctx, row.ID)
	if err != nil {
		return User{}, err
	}

	return User{
		ID:        row.ID,
		Username:  row.Username,
		Email:     row.Email,
		Name:      row.Name,
		Role:      role,
		Groups:    groups,
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *postgresRepository) allUserGroups(ctx context.Context) (map[string][]GroupRef, error) {
	rows, err := r.q.ListAllUserGroups(ctx)
	if err != nil {
		return nil, err
	}

	byUser := make(map[string][]GroupRef)
	for _, row := range rows {
		byUser[row.UserID] = append(byUser[row.UserID], GroupRef{
			ID:    row.GroupID,
			Name:  row.GroupName,
			Color: row.GroupColor,
		})
	}
	return byUser, nil
}

func (r *postgresRepository) allUserRoles(ctx context.Context) (map[string]*RoleRef, error) {
	rows, err := r.q.ListAllUserRoles(ctx)
	if err != nil {
		return nil, err
	}

	byUser := make(map[string]*RoleRef)
	for _, row := range rows {
		byUser[row.UserID] = &RoleRef{ID: row.RoleID, Name: row.RoleName, Color: row.RoleColor}
	}
	return byUser, nil
}

// userRole resolves the single display role a user holds, or nil when none is
// assigned.
func (r *postgresRepository) userRole(ctx context.Context, userID string) (*RoleRef, error) {
	row, err := r.q.GetUserRole(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &RoleRef{ID: row.ID, Name: row.Name, Color: row.Color}, nil
}

func (r *postgresRepository) userGroups(ctx context.Context, userID string) ([]GroupRef, error) {
	rows, err := r.q.ListUserGroupsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	groups := make([]GroupRef, 0, len(rows))
	for _, row := range rows {
		groups = append(groups, GroupRef{ID: row.ID, Name: row.Name, Color: row.Color})
	}
	return groups, nil
}

func (r *postgresRepository) UsernameExists(ctx context.Context, username string) (bool, error) {
	return r.q.UserExistsByUsername(ctx, username)
}

func (r *postgresRepository) UserExists(ctx context.Context, id string) (bool, error) {
	return r.q.UserExistsByID(ctx, id)
}

func (r *postgresRepository) CreateUser(ctx context.Context, id, username, password, name, email string) error {
	return r.q.CreateAdminUser(ctx, sqlc.CreateAdminUserParams{
		ID:       id,
		Username: username,
		Password: password,
		Name:     name,
		Email:    email,
	})
}

func (r *postgresRepository) UpdateUser(ctx context.Context, id, name, email string) error {
	return r.q.UpdateUserProfile(ctx, sqlc.UpdateUserProfileParams{
		ID:    id,
		Name:  name,
		Email: email,
	})
}

func (r *postgresRepository) SoftDeleteUser(ctx context.Context, id string) error {
	return r.q.SoftDeleteUser(ctx, id)
}

func (r *postgresRepository) SetUserRole(ctx context.Context, userID, roleID string) error {
	return r.q.SetUserRole(ctx, sqlc.SetUserRoleParams{
		ID:     userID,
		RoleID: pgtype.Text{String: roleID, Valid: roleID != ""},
	})
}

// ReplaceUserGroups treats groups as a set: the edit replaces the membership
// list wholesale, so removing a group in the dialog removes the row.
func (r *postgresRepository) ReplaceUserGroups(ctx context.Context, userID string, groupIDs []string) error {
	if err := r.q.DeleteGroupMembers(ctx, userID); err != nil {
		return err
	}

	for _, groupID := range groupIDs {
		if err := r.q.AddGroupMember(ctx, sqlc.AddGroupMemberParams{
			UserID:  userID,
			GroupID: groupID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *postgresRepository) ListGroups(ctx context.Context) ([]Group, error) {
	rows, err := r.q.ListGroups(ctx)
	if err != nil {
		return nil, err
	}

	groups := make([]Group, 0, len(rows))
	for _, row := range rows {
		permissions, err := r.q.ListGroupPermissions(ctx, row.ID)
		if err != nil {
			return nil, err
		}

		members, err := r.groupMembers(ctx, row.ID)
		if err != nil {
			return nil, err
		}

		groups = append(groups, Group{
			ID:          row.ID,
			Name:        row.Name,
			Color:       row.Color,
			Permissions: permissions,
			Members:     members,
		})
	}
	return groups, nil
}

func (r *postgresRepository) groupMembers(ctx context.Context, groupID string) ([]Member, error) {
	rows, err := r.q.ListGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}

	members := make([]Member, 0, len(rows))
	for _, row := range rows {
		role, err := r.userRole(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		groups, err := r.userGroups(ctx, row.ID)
		if err != nil {
			return nil, err
		}

		members = append(members, Member{
			ID:       row.ID,
			Username: row.Username,
			Name:     row.Name,
			Email:    row.Email,
			Role:     role,
			Groups:   groups,
		})
	}
	return members, nil
}

func (r *postgresRepository) GetGroup(ctx context.Context, id string) (GroupRef, error) {
	row, err := r.q.GetGroup(ctx, id)
	if err != nil {
		return GroupRef{}, err
	}
	return GroupRef{ID: row.ID, Name: row.Name, Color: row.Color}, nil
}

func (r *postgresRepository) GroupNameExists(ctx context.Context, name string, excludeID string) (bool, error) {
	return r.q.GroupNameExistsExcluding(ctx, sqlc.GroupNameExistsExcludingParams{
		Name: name,
		ID:   excludeID,
	})
}

func (r *postgresRepository) CreateGroup(ctx context.Context, id, name, color string) error {
	return r.q.CreateGroup(ctx, sqlc.CreateGroupParams{ID: id, Name: name, Color: color})
}

func (r *postgresRepository) UpdateGroup(ctx context.Context, id, name, color string) error {
	return r.q.UpdateGroup(ctx, sqlc.UpdateGroupParams{ID: id, Name: name, Color: color})
}

func (r *postgresRepository) SoftDeleteGroup(ctx context.Context, id string) error {
	return r.q.SoftDeleteGroup(ctx, id)
}

func (r *postgresRepository) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	return r.q.RemoveGroupMember(ctx, sqlc.RemoveGroupMemberParams{
		GroupID: groupID,
		UserID:  userID,
	})
}

func (r *postgresRepository) ListGroupPermissions(ctx context.Context, groupID string) ([]string, error) {
	return r.q.ListGroupPermissions(ctx, groupID)
}

func (r *postgresRepository) ReplaceGroupPermissions(ctx context.Context, groupID string, permissions []string) error {
	if err := r.q.DeleteGroupPermissions(ctx, groupID); err != nil {
		return err
	}

	for _, permission := range permissions {
		if err := r.q.AddGroupPermission(ctx, sqlc.AddGroupPermissionParams{
			GroupID:    groupID,
			Permission: permission,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *postgresRepository) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := r.q.ListRoles(ctx)
	if err != nil {
		return nil, err
	}

	roles := make([]Role, 0, len(rows))
	for _, row := range rows {
		members, err := r.roleMembers(ctx, row.ID)
		if err != nil {
			return nil, err
		}

		roles = append(roles, Role{
			ID:      row.ID,
			Name:    row.Name,
			Color:   row.Color,
			Members: members,
		})
	}
	return roles, nil
}

func (r *postgresRepository) roleMembers(ctx context.Context, roleID string) ([]Member, error) {
	rows, err := r.q.ListRoleMembers(ctx, pgtype.Text{String: roleID, Valid: true})
	if err != nil {
		return nil, err
	}

	members := make([]Member, 0, len(rows))
	for _, row := range rows {
		role, err := r.userRole(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		groups, err := r.userGroups(ctx, row.ID)
		if err != nil {
			return nil, err
		}

		members = append(members, Member{
			ID:       row.ID,
			Username: row.Username,
			Name:     row.Name,
			Email:    row.Email,
			Role:     role,
			Groups:   groups,
		})
	}
	return members, nil
}

func (r *postgresRepository) GetRole(ctx context.Context, id string) (RoleRef, error) {
	row, err := r.q.GetRole(ctx, id)
	if err != nil {
		return RoleRef{}, err
	}
	return RoleRef{ID: row.ID, Name: row.Name, Color: row.Color}, nil
}

func (r *postgresRepository) RoleNameExists(ctx context.Context, name string, excludeID string) (bool, error) {
	return r.q.RoleNameExistsExcluding(ctx, sqlc.RoleNameExistsExcludingParams{
		Name: name,
		ID:   excludeID,
	})
}

func (r *postgresRepository) CreateRole(ctx context.Context, id, name, color string) error {
	return r.q.CreateRole(ctx, sqlc.CreateRoleParams{ID: id, Name: name, Color: color})
}

func (r *postgresRepository) UpdateRole(ctx context.Context, id, name, color string) error {
	return r.q.UpdateRole(ctx, sqlc.UpdateRoleParams{ID: id, Name: name, Color: color})
}

func (r *postgresRepository) SoftDeleteRole(ctx context.Context, id string) error {
	return r.q.SoftDeleteRole(ctx, id)
}

func (r *postgresRepository) ListPublicRooms(ctx context.Context) ([]RoomInfo, error) {
	rows, err := r.q.ListAllRooms(ctx)
	if err != nil {
		return nil, err
	}

	rooms := make([]RoomInfo, 0, len(rows))
	for _, row := range rows {
		rooms = append(rooms, RoomInfo{ID: row.ID, Name: row.Name})
	}
	return rooms, nil
}

func (r *postgresRepository) RenameRoom(ctx context.Context, id, name string) error {
	return r.q.RenameRoom(ctx, sqlc.RenameRoomParams{ID: id, Name: name})
}

func (r *postgresRepository) RoomNameExists(ctx context.Context, name string, excludeID string) (bool, error) {
	return r.q.RoomNameExistsExcluding(ctx, sqlc.RoomNameExistsExcludingParams{
		Name: name,
		ID:   excludeID,
	})
}

func (r *postgresRepository) RoomHasExplicitPermissions(ctx context.Context, roomID string) (bool, error) {
	result, err := r.q.RoomHasExplicitPermissions(ctx, roomID)
	if err != nil {
		return false, err
	}
	return result.Bool, nil
}

func (r *postgresRepository) RoomPermissionRows(ctx context.Context, roomID string) ([]RoomPermissionRow, error) {
	rows, err := r.q.ListRoomPermissions(ctx, roomID)
	if err != nil {
		return nil, err
	}

	granted := make([]RoomPermissionRow, 0, len(rows))
	for _, row := range rows {
		granted = append(granted, RoomPermissionRow{
			UserID:     row.UserID,
			Username:   row.Username,
			Name:       row.Name,
			Permission: row.Permission,
		})
	}
	return granted, nil
}

func (r *postgresRepository) ReplaceRoomPermissionsForUser(ctx context.Context, roomID, userID string, permissions []string) error {
	if err := r.q.DeleteRoomPermissionsForUser(ctx, sqlc.DeleteRoomPermissionsForUserParams{
		RoomID: roomID,
		UserID: userID,
	}); err != nil {
		return err
	}

	for _, permission := range permissions {
		if err := r.q.AddRoomPermission(ctx, sqlc.AddRoomPermissionParams{
			RoomID:     roomID,
			UserID:     userID,
			Permission: permission,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *postgresRepository) RoomGroupPermissionRows(ctx context.Context, roomID string) ([]RoomGroupPermissionRow, error) {
	rows, err := r.q.ListRoomGroupPermissions(ctx, roomID)
	if err != nil {
		return nil, err
	}

	granted := make([]RoomGroupPermissionRow, 0, len(rows))
	for _, row := range rows {
		granted = append(granted, RoomGroupPermissionRow{
			GroupID:    row.GroupID,
			Name:       row.Name,
			Color:      row.Color,
			Permission: row.Permission,
		})
	}
	return granted, nil
}

func (r *postgresRepository) ReplaceRoomGroupPermissionsForGroup(ctx context.Context, roomID, groupID string, permissions []string) error {
	if err := r.q.DeleteRoomGroupPermissionsForGroup(ctx, sqlc.DeleteRoomGroupPermissionsForGroupParams{
		RoomID:  roomID,
		GroupID: groupID,
	}); err != nil {
		return err
	}

	for _, permission := range permissions {
		if err := r.q.AddRoomGroupPermission(ctx, sqlc.AddRoomGroupPermissionParams{
			RoomID:     roomID,
			GroupID:    groupID,
			Permission: permission,
		}); err != nil {
			return err
		}
	}
	return nil
}
