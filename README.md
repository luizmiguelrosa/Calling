# Calling

**Calling** is a proof-of-concept (POC) of a high-performance internal chat application, designed to consume the minimum possible resources from both the user's computer and the backend server — in the spirit of tools like Slack and Teams, but without the heavy footprint of Electron-based clients.

---

## The Problem

Traditional chat clients built with Electron (Slack, Teams, etc.) bundle an entire Chromium browser per user. That means:

- High RAM and CPU usage on every user machine.
- Larger download / install size.
- More energy consumption on laptops.

For an **internal** chat used constantly by many employees, that overhead is a real cost.

## The Solution

Two technologies chosen specifically for their performance profile:

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | **Go** | Exceptional capacity for managing thousands of concurrent WebSocket connections (goroutines + native concurrency), low memory usage, single static binary, fast cold start. |
| **Frontend** | **Tauri (Rust)** | Renders native windows using the OS webview instead of bundling a browser; tiny binary (~a few MB vs ~150MB+ for Electron); low RAM/CPU footprint; written in Rust for performance. |

> Calling is a **POC** — the goal is to validate that this architecture can deliver a Slack/Teams-like experience at a fraction of the resource cost.

---

## Architecture

```mermaid
graph LR
    U[User Desktop] --> W[Tauri App - Rust webview]
    W -->|WebSocket JSON| S[Go Chat Server]
    S --> R[In-Memory Repository]
    S --> M[Connection Manager]
```

- **Tauri frontend** opens a WebSocket connection to the Go server.
- **Go server** multiplexes all client connections efficiently (one goroutine per connection).
- Messages are validated, persisted, and routed (broadcast to public rooms, or sent to the specific participant in DMs).
- Currently uses an **in-memory repository** (POC stage) — a production DB layer can be swapped in behind the `Repository` interface.

### Tech stack

- **Backend**: Go, [chi](https://github.com/go-chi/chi) router, [gorilla/websocket](https://github.com/gorilla/websocket), [go-playground/validator](https://github.com/go-playground/validator), [go.uber.org/dig](https://github.com/uber-go/dig) (dependency injection), go-chi/cors.
- **Frontend (planned)**: Tauri (Rust + system webview).

---

## Features

- **Public rooms** — create and list public chat rooms.
- **Direct Messages (DMs)** — 1:1 private rooms between two users.
  - Room name is normalized as `{smaller_id}-{larger_id}` to guarantee a single canonical room per user pair.
  - Only participants can send messages in a DM (others get an error).
  - DMs are isolated: a DM message is routed **only** to the other participant, never broadcast.
- **Message history** per room.
- **Online users** list (current WebSocket connections).
- **WebSocket real-time messaging** with broadcast (public) and targeted (DM) delivery.

---

## API Endpoints

### HTTP

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/historico` | Get message history of a room (`?room_id=`) | — |
| `GET` | `/onlineUsers` | List currently connected users | — |
| `POST` | `/rooms` | Create a public room | — |
| `GET` | `/rooms` | List **public** rooms only (DMs excluded) | — |
| `POST` | `/rooms/dm` | Create a DM room | `user_id` query |
| `GET` | `/rooms/dm` | List DM rooms of the current user | `user_id` query |
| `GET` | `/chat` | Upgrade to WebSocket connection | `user_id` query |

### Request / Response examples

**Create a DM room**

```http
POST /rooms/dm?user_id=1001
Content-Type: application/json

{ "receiver_id": "2002" }
```

```json
{
  "id": "1755000000000000000",
  "name": "1001-2002",
  "is_dm": true
}
```

**List DM rooms of current user**

```http
GET /rooms/dm?user_id=1001
```

```json
[
  { "id": "1755000000000000000", "name": "1001-2002", "is_dm": true }
]
```

**List public rooms**

```http
GET /rooms
```

```json
[
  { "id": "1754999999999999999", "name": "geral", "is_dm": false }
]
```

### WebSocket

Connect with the user identity in the query string:

```
ws://localhost:8080/chat?user_id=1001
```

**Send a message** (JSON frame):

```json
{ "room_id": "<room_id>", "content": "Olá, mundo!" }
```

**Delivery model**

- **Public rooms**: the message is broadcast to all other connected users.
- **Direct messages**: the message is delivered **only** to the other participant of the DM room.
- **Errors** (e.g., sending to a DM you're not part of) are returned as `{ "message": "..." }`.

---

## Getting Started

### Prerequisites

- [Go](https://go.dev/dl/) 1.26+
- (Frontend, planned) [Rust](https://rustup.rs/) + [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/)

### Running the backend

```bash
cd chat-backend
go run ./cmd/server
```

The server starts on `http://localhost:8080`.

### Project structure

```
Calling/
└── chat-backend/
    ├── cmd/server/          # Entry point (router, CORS, DI wiring)
    └── internal/
        ├── chat/            # Manager (WebSocket), Service, Repository
        ├── container/       # Dependency injection container (dig)
        ├── database/        # (placeholders for future DB layer)
        ├── httputil/        # Validation / JSON helpers
        └── models/          # DTOs and domain models
```

### Layers

- **Manager** (`internal/chat/handler.go`) — HTTP handlers + WebSocket connection lifecycle.
- **Service** (`internal/chat/service.go`) — business rules (validation, DM permission checks, room naming).
- **Repository** (`internal/chat/repository.go`) — data access. Currently in-memory; swap for a database by implementing the `Repository` interface.

---

## Roadmap

- [ ] Swap in-memory repository for a persistent database.
- [ ] Authentication / authorization layer.
- [ ] Tauri frontend client.

---
