# Chat API Reference

Quick reference for the Calling chat backend API.

## Base URL
```
http://localhost:8080
```

## Authentication
Most endpoints require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/users` | Register new user | No |
| POST | `/users/login` | Login and get JWT | No |

### Users
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/users?user_id=<id>` | Get user by ID | Yes |
| GET | `/users/online` | List online users | Yes |

### Rooms
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/rooms` | Create public room | Yes |
| GET | `/rooms` | List public rooms | Yes |
| POST | `/rooms/dm` | Create DM room | Yes |
| GET | `/rooms/dm` | List user's DM rooms | Yes |

### Messages
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/history?room_id=<id>` | Get room message history | Yes |
| WS | `/chat` | WebSocket for real-time messaging | Yes |

## Data Models

### User
```json
{
  "id": "string",
  "username": "string",
  "name": "string",
  "role": "Developer|Admin"
}
```

### CreateUserInput
```json
{
  "username": "string (3-32 chars)",
  "password": "string (8-72 chars)",
  "name": "string (2-64 chars)",
  "role": "Developer|Admin"
}
```

### LoginRequest
```json
{
  "username": "string",
  "password": "string"
}
```

### LoginResponse
```json
{
  "token": "string (JWT)"
}
```

### RoomResponse
```json
{
  "id": "string",
  "name": "string",
  "is_dm": "boolean"
}
```

### CreateRoomInput
```json
{
  "name": "string (3-32 chars)",
  "is_dm": "boolean"
}
```

### CreateDMInput
```json
{
  "receiver_id": "string"
}
```

### MessageBroadcast
```json
{
  "room_id": "string",
  "author": "string (user ID)",
  "content": "string",
  "sentAt": "ISO timestamp"
}
```

### IncomingMessage (WebSocket)
```json
{
  "room_id": "string (min 3 chars)",
  "content": "string (max 500 chars)"
}
```

## WebSocket Protocol

### Connection
- Connect to `ws://localhost:8080/chat`
- Include JWT in Authorization header during handshake
- Or send auth as first message: `{"type": "auth", "token": "<jwt>"}`

### Message Format
Send:
```json
{
  "room_id": "<room_id>",
  "content": "<message_content>"
}
```

Receive:
```json
{
  "room_id": "<room_id>",
  "author": "<user_id>",
  "content": "<message_content>",
  "sentAt": "<ISO timestamp>"
}
```

### Message Types
- Public room messages: Broadcast to all connected users in room
- DM messages: Sent only to the other participant in the DM room

## Error Responses
All errors return JSON format:
```json
{
  "message": "Error description"
}
```

Common HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request (missing/invalid parameters)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (resource already exists)
- 500: Internal Server Error

## Rate Limiting
Currently no rate limiting implemented in backend (POC).

## WebSocket Reconnection
Implement exponential backoff reconnection strategy:
1. Attempt reconnection after 1s, 2s, 4s, 8s, max 30s
2. Reset counter on successful connection
3. Max retry attempts: 10