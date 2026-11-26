package admin

import (
	"chat-backend/internal/auth"
	"chat-backend/internal/httputil"
	"chat-backend/internal/permissions"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Handler exposes the admin endpoints. Authorization is applied by the router
// (one `permissions.Require` per category), so a group holding only
// `groups.manage` reaches the group endpoints and nothing else.
type Handler struct {
	service     Service
	permissions permissions.Service
}

func NewHandler(service Service, permissionService permissions.Service) *Handler {
	return &Handler{service: service, permissions: permissionService}
}

// GetMyPermissions serves GET /me/permissions, which the client reads to decide
// whether to show the admin entry and which categories to render.
func (h *Handler) GetMyPermissions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized: missing user identity")
		return
	}

	granted, err := h.permissions.List(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, MyPermissions{Permissions: granted})
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.service.ListUsers(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[CreateUserInput](w, r)
	if !valid {
		return
	}

	user, err := h.service.CreateUser(r.Context(), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[UpdateUserInput](w, r)
	if !valid {
		return
	}

	user, err := h.service.UpdateUser(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserIDFromContext(r.Context())

	if err := h.service.DeleteUser(r.Context(), actorID, chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.service.ListGroups(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, groups)
}

// GetGroup answers a direct lookup. A removed group is a null body, matching the
// rule the admin UI follows when it renders "Grupo desconhecido".
func (h *Handler) GetGroup(w http.ResponseWriter, r *http.Request) {
	group, err := h.service.GetGroup(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if strings.HasPrefix(err.Error(), "not_found") {
			writeJSON(w, http.StatusOK, nil)
			return
		}
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, group)
}

// ListGroupOptions is the mention roster shape: id, name and colour only,
// without the member and permission payload the admin groups category needs. It
// is readable by any signed-in user so `@group:` mentions can resolve.
func (h *Handler) ListGroupOptions(w http.ResponseWriter, r *http.Request) {
	groups, err := h.service.ListGroups(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}

	options := make([]GroupRef, 0, len(groups))
	for _, group := range groups {
		options = append(options, GroupRef{ID: group.ID, Name: group.Name, Color: group.Color})
	}
	writeJSON(w, http.StatusOK, options)
}

func (h *Handler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[CreateGroupInput](w, r)
	if !valid {
		return
	}

	group, err := h.service.CreateGroup(r.Context(), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, group)
}

func (h *Handler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[UpdateGroupInput](w, r)
	if !valid {
		return
	}

	group, err := h.service.UpdateGroup(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, group)
}

func (h *Handler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	if err := h.service.DeleteGroup(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	if err := h.service.RemoveGroupMember(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "userId")); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SetGroupPermissions(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[SetGroupPermissionsInput](w, r)
	if !valid {
		return
	}

	if _, err := h.service.SetGroupPermissions(r.Context(), chi.URLParam(r, "id"), input); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.service.ListRoles(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roles)
}

// GetRole answers a direct lookup. A removed role is a null body.
func (h *Handler) GetRole(w http.ResponseWriter, r *http.Request) {
	role, err := h.service.GetRole(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if strings.HasPrefix(err.Error(), "not_found") {
			writeJSON(w, http.StatusOK, nil)
			return
		}
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, role)
}

// ListRoleOptions is the selector shape: id, name and colour only, without the
// member payload. It is readable by any signed-in user so a users.manage holder
// can fill the role field.
func (h *Handler) ListRoleOptions(w http.ResponseWriter, r *http.Request) {
	roles, err := h.service.ListRoles(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}

	options := make([]RoleRef, 0, len(roles))
	for _, role := range roles {
		options = append(options, RoleRef{ID: role.ID, Name: role.Name, Color: role.Color})
	}
	writeJSON(w, http.StatusOK, options)
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[CreateRoleInput](w, r)
	if !valid {
		return
	}

	role, err := h.service.CreateRole(r.Context(), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, role)
}

func (h *Handler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[UpdateRoleInput](w, r)
	if !valid {
		return
	}

	role, err := h.service.UpdateRole(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, role)
}

func (h *Handler) DeleteRole(w http.ResponseWriter, r *http.Request) {
	if err := h.service.DeleteRole(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListRooms(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.service.ListRooms(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rooms)
}

func (h *Handler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[RenameRoomInput](w, r)
	if !valid {
		return
	}

	room, err := h.service.RenameRoom(r.Context(), chi.URLParam(r, "id"), input)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, room)
}

func (h *Handler) GetRoomPermissions(w http.ResponseWriter, r *http.Request) {
	roomPermissions, err := h.service.GetRoomPermissions(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, roomPermissions)
}

func (h *Handler) SetRoomPermissions(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[SetRoomPermissionsInput](w, r)
	if !valid {
		return
	}

	if err := h.service.SetRoomPermissions(r.Context(), chi.URLParam(r, "id"), input); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) PermissionCatalog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, permissions.Catalog)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

// writeServiceError maps the service's prefixed sentinels onto HTTP statuses.
func writeServiceError(w http.ResponseWriter, err error) {
	switch {
	case strings.HasPrefix(err.Error(), "not_found"):
		writeError(w, http.StatusNotFound, err.Error())
	case strings.HasPrefix(err.Error(), "conflict"):
		writeError(w, http.StatusConflict, err.Error())
	case strings.HasPrefix(err.Error(), "invalid"):
		writeError(w, http.StatusBadRequest, err.Error())
	case strings.HasPrefix(err.Error(), "forbidden"):
		writeError(w, http.StatusForbidden, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}
