package chat

import (
	"chat-backend/internal/auth"
	"chat-backend/internal/httputil"
	"chat-backend/internal/models"
	"chat-backend/internal/user"
	"context"
	"encoding/json"
	"log"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gorilla/websocket"
)

var validate = validator.New()

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Manager tracks live connections. A user may hold several at once (two windows,
// two devices), so connections are keyed per user and the outer map only ever
// holds users with at least one open socket.
type Manager struct {
	clients     map[string]map[*websocket.Conn]struct{}
	service     Service
	userService user.Service
	mu          sync.RWMutex
}

func NewManager(service Service, userService user.Service) *Manager {
	return &Manager{
		clients:     make(map[string]map[*websocket.Conn]struct{}),
		service:     service,
		userService: userService,
	}
}

func (m *Manager) GetHistory(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"message": "Missing room_id"})
		return
	}

	history, err := m.service.GetRoomHistory(r.Context(), roomID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(history)
}

func (m *Manager) GetOnlineUsers(w http.ResponseWriter, r *http.Request) {
	m.mu.RLock()
	users := slices.Collect(maps.Keys(m.clients))
	m.mu.RUnlock()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(users)
}

func (m *Manager) CreateRoom(w http.ResponseWriter, r *http.Request) {
	input, valid := httputil.ReadAndValidate[models.CreateRoomInput](w, r)
	if !valid {
		return
	}

	roomData, err := m.service.CreateChannel(r.Context(), input)
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
	json.NewEncoder(w).Encode(roomData)
}

func (m *Manager) ListRooms(w http.ResponseWriter, r *http.Request) {
	channels, err := m.service.GetAvailableChannels(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(channels)
}

func (m *Manager) CreateDM(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"message": "unauthorized: missing user identity"})
		return
	}

	input, valid := httputil.ReadAndValidate[models.CreateDMInput](w, r)
	if !valid {
		return
	}

	roomData, err := m.service.CreateDM(r.Context(), userID, input)
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
	json.NewEncoder(w).Encode(roomData)
}

func (m *Manager) ListUserDMs(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"message": "unauthorized: missing user identity"})
		return
	}

	dms, err := m.service.GetUserDMs(r.Context(), userID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(dms)
}

func (m *Manager) ManageConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized: missing or invalid token", http.StatusUnauthorized)
		return
	}

	// Reject the connection if the user does not exist in the database.
	exists, err := m.userService.ExistsByID(r.Context(), userID)
	if err != nil {
		http.Error(w, "Internal error validating the user", http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "invalid user_id: user does not exist", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	m.mu.Lock()
	if m.clients[userID] == nil {
		m.clients[userID] = make(map[*websocket.Conn]struct{})
	}
	m.clients[userID][conn] = struct{}{}
	m.mu.Unlock()
	log.Printf("-> User [%s] joined the chat via WebSocket!", userID)

	defer func() {
		// Only drop this connection. Removing the user outright would mark them
		// offline while their other windows are still connected.
		m.mu.Lock()
		if conns, ok := m.clients[userID]; ok {
			delete(conns, conn)
			if len(conns) == 0 {
				delete(m.clients, userID)
			}
		}
		m.mu.Unlock()
		conn.Close()
		log.Printf("<- User [%s] left the chat.", userID)
	}()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		incoming, errors := httputil.UnmarshalValidate[models.IncomingMessage](payload)
		if errors != nil {
			log.Printf("WebSocket payload rejected: %v", errors)

			errResponse, _ := json.Marshal(map[string][]string{
				"message": errors,
			})

			conn.WriteMessage(websocket.TextMessage, errResponse)
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		msg, isDM, err := m.service.ProcessAndStoreMessage(ctx, userID, incoming)

		if err != nil {
			cancel()
			errorResponse, _ := json.Marshal(map[string]string{"message": err.Error()})
			conn.WriteMessage(websocket.TextMessage, errorResponse)
			continue
		}

		jsonBytes, _ := json.Marshal(msg)

		m.mu.RLock()
		if isDM {
			participants, err := m.service.GetDMParticipants(ctx, incoming.RoomID)
			if err == nil {
				for _, participantID := range participants {
					if participantID == userID {
						continue
					}
					for dc := range m.clients[participantID] {
						dc.WriteMessage(websocket.TextMessage, jsonBytes)
					}
				}
			} else {
				log.Printf("Error resolving DM participants for %s: %v", incoming.RoomID, err)
			}
		} else {
			for clientID, conns := range m.clients {
				if clientID == userID {
					continue
				}
				for clientConn := range conns {
					if err := clientConn.WriteMessage(websocket.TextMessage, jsonBytes); err != nil {
						log.Printf("Error sending message to %s: %v", clientID, err)
					}
				}
			}
		}
		m.mu.RUnlock()

		// Cancelled only now: the DM branch still needs ctx to resolve the
		// participants, and cancelling early made every DM lookup fail on a
		// dead context, so nothing was ever delivered.
		cancel()
	}
}
