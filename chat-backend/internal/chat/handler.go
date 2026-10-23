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
	clients map[string]map[*websocket.Conn]struct{}
	// statuses holds the last availability each connected user announced, so a
	// client that joins later can be told the current state without waiting for
	// every peer to change it again.
	statuses    map[string]string
	service     Service
	userService user.Service
	mu          sync.RWMutex
}

func NewManager(service Service, userService user.Service) *Manager {
	return &Manager{
		clients:     make(map[string]map[*websocket.Conn]struct{}),
		statuses:    make(map[string]string),
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

// SendBatchMessages accepts a JSON batch: several messages for one room, each
// optionally referencing a file uploaded beforehand through the room's file
// endpoint. Peers learn about the batch over the socket; the sender renders from
// this response, since a broadcast never echoes back to its author.
func (m *Manager) SendBatchMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"message": "unauthorized: missing user identity"})
		return
	}

	input, valid := httputil.ReadAndValidate[models.BatchSendInput](w, r)
	if !valid {
		return
	}

	// A batch writes several rows, so it gets a wider budget than the 5s a
	// single socket message uses.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	messages, isDM, err := m.service.SendBatch(ctx, userID, input)
	if err != nil {
		w.WriteHeader(statusForError(err))
		json.NewEncoder(w).Encode(map[string]string{"message": err.Error()})
		return
	}

	for _, msg := range messages {
		payload, err := json.Marshal(msg)
		if err != nil {
			continue
		}
		m.broadcast(ctx, userID, input.RoomID, isDM, payload)
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(messages)
}

// statusForError maps the service's prefixed sentinels onto HTTP statuses.
func statusForError(err error) int {
	switch {
	case strings.HasPrefix(err.Error(), "not_found"):
		return http.StatusNotFound
	case strings.HasPrefix(err.Error(), "forbidden"):
		return http.StatusForbidden
	case strings.HasPrefix(err.Error(), "invalid"):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
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

	// Tell the newcomer who is already here and how they are set, so presence is
	// populated immediately rather than only after the next change.
	m.sendStatusSnapshot(conn)

	defer func() {
		// Only drop this connection. Removing the user outright would mark them
		// offline while their other windows are still connected.
		m.mu.Lock()
		last := false
		if conns, ok := m.clients[userID]; ok {
			delete(conns, conn)
			if len(conns) == 0 {
				delete(m.clients, userID)
				delete(m.statuses, userID)
				last = true
			}
		}
		m.mu.Unlock()
		conn.Close()

		// The last window closed, so the user is no longer reachable: peers clear
		// their dot instead of keeping a stale colour.
		if last {
			m.broadcastStatus(userID, "offline")
		}
		log.Printf("<- User [%s] left the chat.", userID)
	}()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// A typing frame is not a message: it carries no content and is never
		// stored, only relayed to the peers of the room. The envelope is read
		// first because the two frame kinds have different required fields.
		var envelope models.IncomingEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			errResponse, _ := json.Marshal(map[string][]string{"message": {"invalid json structure"}})
			conn.WriteMessage(websocket.TextMessage, errResponse)
			continue
		}

		if envelope.Type == "status" {
			status, errors := httputil.UnmarshalValidate[models.StatusEvent](payload)
			if errors != nil {
				log.Printf("WebSocket status payload rejected: %v", errors)

				errResponse, _ := json.Marshal(map[string][]string{
					"message": errors,
				})

				conn.WriteMessage(websocket.TextMessage, errResponse)
				continue
			}

			m.setStatus(userID, status.Status)
			m.broadcastStatus(userID, status.Status)
			continue
		}

		if envelope.Type == "typing" {
			typing, errors := httputil.UnmarshalValidate[models.TypingEvent](payload)
			if errors != nil {
				log.Printf("WebSocket typing payload rejected: %v", errors)

				errResponse, _ := json.Marshal(map[string][]string{
					"message": errors,
				})

				conn.WriteMessage(websocket.TextMessage, errResponse)
				continue
			}

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			isDM, err := m.service.ResolveRoomAccess(ctx, userID, typing.RoomID)
			if err != nil {
				cancel()
				errorResponse, _ := json.Marshal(map[string]string{"message": err.Error()})
				conn.WriteMessage(websocket.TextMessage, errorResponse)
				continue
			}

			jsonBytes, _ := json.Marshal(models.TypingBroadcast{
				Type:   "typing",
				RoomID: typing.RoomID,
				Author: userID,
				Typing: typing.Typing,
			})
			m.broadcast(ctx, userID, typing.RoomID, isDM, jsonBytes)
			cancel()
			continue
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
		m.broadcast(ctx, userID, incoming.RoomID, isDM, jsonBytes)

		// Cancelled only now: the DM branch still needs ctx to resolve the
		// participants, and cancelling early made every DM lookup fail on a
		// dead context, so nothing was ever delivered.
		cancel()
	}
}

// setStatus records the user's latest availability for the connect snapshot.
func (m *Manager) setStatus(userID, status string) {
	m.mu.Lock()
	m.statuses[userID] = status
	m.mu.Unlock()
}

// sendStatusSnapshot tells a freshly connected client the availability of every
// user already known, so it does not have to wait for each of them to change.
func (m *Manager) sendStatusSnapshot(conn *websocket.Conn) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for userID, status := range m.statuses {
		payload, err := json.Marshal(models.StatusBroadcast{
			Type:   "status",
			Author: userID,
			Status: status,
		})
		if err != nil {
			continue
		}
		conn.WriteMessage(websocket.TextMessage, payload)
	}
}

// broadcastStatus relays a presence change to every other connected client.
// Availability is global, so unlike a message it is not scoped to a room.
func (m *Manager) broadcastStatus(senderID, status string) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	payload, err := json.Marshal(models.StatusBroadcast{
		Type:   "status",
		Author: senderID,
		Status: status,
	})
	if err != nil {
		return
	}

	for clientID, conns := range m.clients {
		if clientID == senderID {
			continue
		}
		for clientConn := range conns {
			if err := clientConn.WriteMessage(websocket.TextMessage, payload); err != nil {
				log.Printf("Error sending status to %s: %v", clientID, err)
			}
		}
	}
}

// broadcast delivers a frame to every peer that should see it: the other
// participant of a DM, or every other connected client for a public room. The
// sender is always excluded — their own client renders the message locally.
func (m *Manager) broadcast(ctx context.Context, senderID string, roomID string, isDM bool, payload []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if isDM {
		participants, err := m.service.GetDMParticipants(ctx, roomID)
		if err != nil {
			log.Printf("Error resolving DM participants for %s: %v", roomID, err)
			return
		}
		for _, participantID := range participants {
			if participantID == senderID {
				continue
			}
			for dc := range m.clients[participantID] {
				dc.WriteMessage(websocket.TextMessage, payload)
			}
		}
		return
	}

	for clientID, conns := range m.clients {
		if clientID == senderID {
			continue
		}
		for clientConn := range conns {
			if err := clientConn.WriteMessage(websocket.TextMessage, payload); err != nil {
				log.Printf("Error sending message to %s: %v", clientID, err)
			}
		}
	}
}
