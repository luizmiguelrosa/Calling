package chat

import (
	"chat-backend/internal/httputil"
	"chat-backend/internal/models"
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

type Manager struct {
	clients map[string]*websocket.Conn
	service Service
	mu      sync.RWMutex
}

func NewManager(service Service) *Manager {
	return &Manager{
		clients: make(map[string]*websocket.Conn),
		service: service,
	}
}

func (m *Manager) GetHistory(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"message": "Campo room_id ausente"})
		return
	}

	log.Println("🌐 Rota REST [/historico] foi chamada.")

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
	log.Println("🌐 Rota REST [/onlineUsers] foi chamada.")

	users := slices.Collect(maps.Keys(m.clients))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(users)
}

func (m *Manager) ManageConnection(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "Campo user_id ausente", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Falha no upgrade de conexão: %v", err)
		return
	}

	m.mu.Lock()
	m.clients[userID] = conn
	m.mu.Unlock()
	log.Printf("-> Usuário [%s] entrou no chat via WebSocket!", userID)

	defer func() {
		m.mu.Lock()
		delete(m.clients, userID)
		m.mu.Unlock()
		conn.Close()
		log.Printf("<- Usuário [%s] saiu do chat.", userID)
	}()

	for {
		_, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		incoming, errors := httputil.UnmarshalValidate[models.IncomingMessage](payload)
		if errors != nil {
			log.Printf("Payload do WebSocket rejeitado: %v", errors)

			errResponse, _ := json.Marshal(map[string][]string{
				"message": errors,
			})

			conn.WriteMessage(websocket.TextMessage, errResponse)
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		msg, err := m.service.ProcessAndStoreMessage(ctx, userID, incoming)
		cancel()

		if err != nil {
			errorResponse, _ := json.Marshal(map[string]string{"message": err.Error()})
			conn.WriteMessage(websocket.TextMessage, errorResponse)
			continue
		}

		jsonBytes, _ := json.Marshal(msg)

		m.mu.RLock()
		if after, ok := strings.CutPrefix(incoming.RoomID, "dm:"); ok {
			for uID := range strings.SplitSeq(after, "-") {
				if uID != userID {
					if connTarget, online := m.clients[uID]; online {
						connTarget.WriteMessage(websocket.TextMessage, jsonBytes)
					}
				}
			}
		} else {
			for clientID, clientConn := range m.clients {
				if clientID != userID {
					if err := clientConn.WriteMessage(websocket.TextMessage, jsonBytes); err != nil {
						log.Printf("Erro ao enviar mensagem para %s: %v", clientID, err)
					}
				}
			}
		}
		m.mu.RUnlock()
	}
}
