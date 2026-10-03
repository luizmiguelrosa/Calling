# Chat Frontend Implementation Checklist

Based on the Go backend (`chat-backend`) architecture and API.

## Phase 1: Project Setup
- [ ] Initialize Angular + Tauri project structure
- [ ] Configure Tailwind CSS (`tailwind.config.js`)
- [ ] Set up environment variables (`.env` for API URL)
- [ ] Create basic routing (`app-routing.module.ts`)
- [ ] Implement AuthGuard for protected routes

## Phase 2: Authentication
- [ ] Create `AuthService` (login, register, token storage)
- [ ] Create `LoginComponent` (form with validation)
- [ ] Create `RegisterComponent` (form with validation)
- [ ] Implement JWT token storage (localStorage/sessionStorage)
- [ ] Create `AuthInterceptor` for automatic Authorization header
- [ ] Implement `AuthGuard` for route protection
- [ ] Create `LoginResponse` interface

## Phase 3: User Management
- [ ] Create `UserService` (get user, get online users)
- [ ] Implement user profile display
- [ ] Create online users sidebar component
- [ ] Implement user lookup by ID

## Phase 4: Room Management
- [ ] Create `RoomService` (create room, create DM, list rooms)
- [ ] Implement `CreateRoomComponent`
- [ ] Implement `CreateDMComponent`
- [ ] Create `RoomListComponent` (public rooms)
- [ ] Create `DMListComponent` (direct messages)
- [ ] Implement room selection/navigation

## Phase 5: Messaging (REST)
- [ ] Create `MessageService` (get history)
- [ ] Implement `MessageHistoryComponent`
- [ ] Create `MessageBroadcast` interface
- [ ] Implement message display with author info
- [ ] Add timestamp formatting

## Phase 6: Real-Time Messaging (WebSocket)
- [ ] Create `WebSocketService`
- [ ] Implement WebSocket connection to `/chat`
- [ ] Handle JWT authentication for WebSocket
- [ ] Implement message sending (`IncomingMessage` format)
- [ ] Implement message receiving (`MessageBroadcast` format)
- [ ] Handle WebSocket errors and reconnection
- [ ] Implement message routing (public vs DM)

## Phase 7: Chat Interface
- [ ] Create `ChatLayoutComponent` (main layout)
- [ ] Create `MessageInputComponent` (text input + send button)
- [ ] Create `MessageListComponent` (scrollable message history)
- [ ] Create `RoomHeaderComponent` (room name, participant info)
- [ ] Implement message validation (max 500 chars)
- [ ] Add message timestamp display
- [ ] Implement auto-scroll to bottom

## Phase 8: Integration
- [ ] Connect WebSocket messages to message list
- [ ] Implement room switching
- [ ] Add message persistence (local cache)
- [ ] Implement user presence indicators
- [ ] Add error notifications for failed operations

## Phase 9: Testing
- [ ] Unit tests for services
- [ ] Component tests for forms
- [ ] Integration tests for auth flow
- [ ] WebSocket connection tests
- [ ] End-to-end tests for chat flow

## Phase 10: Polish & Deployment
- [ ] Add loading states
- [ ] Implement responsive design
- [ ] Add dark/light theme support
- [ ] Configure Tauri build settings
- [ ] Build for target platforms (Windows, macOS, Linux)
- [ ] Add application icons and branding

## Key Implementation Notes

### Authentication Flow
1. User logs in → receives JWT token
2. Token stored in localStorage
3. AuthInterceptor adds `Authorization: Bearer <token>` to all requests
4. WebSocket connects with token in header

### WebSocket Message Flow
1. User selects room
2. WebSocket connects to `/chat`
3. User sends `IncomingMessage` JSON
4. Backend validates and broadcasts
5. Client receives `MessageBroadcast` JSON
6. Message added to message list

### Room Types
- **Public Room**: `is_dm: false`, messages broadcast to all users
- **DM Room**: `is_dm: true`, messages sent only to other participant
- DM room names are canonical: `{smaller_id}-{larger_id}`

### Error Handling Patterns
- 401: Redirect to login
- 409: Show conflict message (username/room exists)
- 500: Show generic error
- WebSocket disconnect: Auto-reconnect with backoff

### Security Considerations
- Never expose JWT in console logs
- Validate all inputs before sending
- Sanitize message content to prevent XSS
- Implement rate limiting on client for message sending

## Dependencies

### Angular Packages
- `@angular/common/http` - HTTP requests
- `rxjs` - Observable patterns
- `angular/router` - Navigation
- `angular/forms` - Form handling

### Tauri Packages
- `@tauri-apps/api` - Tauri API access
- `@tauri-apps/plugin-shell` - Shell commands (optional)

### Development Tools
- Angular CLI
- Tauri CLI
- Go backend server
- PostgreSQL (via Docker Compose)
