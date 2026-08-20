package user

import (
	"chat-backend/internal/httputil"
	"encoding/json"
	"net/http"
	"strings"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[CreateUserInput](w, r)
	if !valid {
		return
	}

	created, err := h.service.Register(r.Context(), input)
	if err != nil {
		if strings.HasPrefix(err.Error(), "conflict") {
			w.WriteHeader(http.StatusConflict)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[LoginInput](w, r)
	if !valid {
		return
	}

	u, err := h.service.ValidateCredentials(r.Context(), input.Username, input.Password)
	if err != nil {
		if strings.HasPrefix(err.Error(), "unauthorized") {
			w.WriteHeader(http.StatusUnauthorized)
		} else if strings.HasPrefix(err.Error(), "not_found") {
			w.WriteHeader(http.StatusNotFound)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	// JWT will be issued here in the future. For now we return the user data
	// so the client can keep using the user_id based flow.
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(UserResponse{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Role:     u.Role,
	})
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"message": "Missing user_id field"})
		return
	}

	u, err := h.service.GetByID(r.Context(), userID)
	if err != nil {
		if strings.HasPrefix(err.Error(), "not_found") {
			w.WriteHeader(http.StatusNotFound)
		} else {
			w.WriteHeader(http.StatusInternalServerError)
		}
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(UserResponse{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Role:     u.Role,
	})
}
