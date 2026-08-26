package user

import (
	"chat-backend/internal/auth"
	"chat-backend/internal/httputil"
	"encoding/json"
	"net/http"
	"strings"
)

type Handler struct {
	service    Service
	authSecret []byte
}

func NewHandler(service Service, authSecret []byte) *Handler {
	return &Handler{service: service, authSecret: authSecret}
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

type LoginRequest struct {
	Username string `json:"username" validate:"required,min=3,max=32"`
	Password string `json:"password" validate:"required,min=8,max=72"`
}

func (l LoginRequest) Validate() error {
	return validate.Struct(l)
}

type LoginResponse struct {
	Token string `json:"token"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[LoginRequest](w, r)
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

	token, err := auth.GenerateToken(h.authSecret, u.ID, u.Username)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"message": "failed to generate token"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(LoginResponse{
		Token: token,
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
