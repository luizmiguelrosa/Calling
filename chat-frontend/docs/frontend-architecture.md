# Chat Frontend Architecture

This document provides a comprehensive guide for implementing the Tauri-based frontend for the Calling chat application, based on the Go backend API.

## Overview

The frontend is a Tauri application that provides a desktop chat client interface. It communicates with the Go backend via:
- REST API for user management, room operations, and message history
- WebSocket connection for real-time messaging

## Backend API Reference

### Authentication
All endpoints (except registration and login) require JWT authentication via the `Authorization: Bearer <token>` header.

#### Register User
- **POST** `/users`
- Request Body: `CreateUserInput`
- Response: `UserResponse`

#### Login
- **POST** `/users/login`
- Request Body: `LoginRequest`
- Response: `{ "token": "...", "user": {...} }`

### User Endpoints
- **GET** `/users?user_id=<id>` - Get user by ID
- **GET** `/users/online` - List currently connected users

### Room Endpoints
- **POST** `/rooms` - Create a public room
  - Request Body: `CreateRoomInput` (with `is_dm=false`)
  - Response: `RoomResponse`
- **GET** `/rooms` - List public rooms
  - Response: `[]RoomResponse`
- **POST** `/rooms/dm` - Create a direct message room
  - Request Body: `CreateDMInput`
  - Response: `RoomResponse`
- **GET** `/rooms/dm` - List DM rooms for current user
  - Response: `[]RoomResponse`

### Message Endpoints
- **GET** `/history?room_id=<id>` - Get message history for a room
  - Response: `[]MessageBroadcast`

### WebSocket Endpoint
- **GET** `/chat` - WebSocket upgrade endpoint
  - Requires valid JWT in Authorization header
  - Messages sent/received as JSON: `{"room_id": "...", "content": "..."}`

## Data Models

### User Models
```typescript
interface User {
  id: string;
  username: string;
  name: string;
  role: "Developer" | "Admin";
  createdAt: string; // ISO timestamp
}

interface CreateUserInput {
  username: string; // 3-32 chars
  password: string; // 8-72 chars
  name: string; // 2-64 chars
  role: "Developer" | "Admin";
}

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  token: string;
}

interface UserResponse {
  id: string;
  username: string;
  name: string;
  role: "Developer" | "Admin";
}
```

### Room Models
```typescript
type RoomType = "public" | "direct";

interface RoomResponse {
  id: string;
  name: string;
  is_dm: boolean; // true for DM rooms
}

interface CreateRoomInput {
  name: string; // 3-32 chars
  is_dm: boolean;
}

interface CreateDMInput {
  receiver_id: string; // User ID of the recipient
}
```

### Message Models
```typescript
interface MessageBroadcast {
  room_id: string;
  author: string; // User ID of sender
  content: string;
  sentAt: string; // ISO timestamp
}

interface IncomingMessage {
  room_id: string; // min 3 chars
  content: string; // max 500 chars
}
```

## Implementation Guide

### 1. Authentication Service
Create a service to handle JWT storage and API requests:

```typescript
// src/app/services/auth.service.ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'jwt_token';
  private apiUrl = 'http://localhost:8080';

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/users/login`,
      { username, password }
    );
  }

  register(userData: CreateUserInput): Observable<UserResponse> {
    return this.http.post<UserResponse>(
      `${this.apiUrl}/users`,
      userData
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : '',
    });
  }
}
```

### 2. WebSocket Service
Create a service for real-time messaging:

```typescript
// src/app/services/websocket.service.ts
@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<MessageBroadcast>();
  private userId: string | null = null;

  constructor(private authService: AuthService) {}

  connect(userId: string): void {
    this.userId = userId;
    const token = this.authService.getToken();
    
    const ws = new WebSocket(`ws://localhost:8080/chat`);
    
    ws.onopen = () => {
      // Send auth token via header (alternative: send as first message)
      // Note: WebSocket doesn't support headers directly, so we might need
      // to send auth as first message or use query params if backend supports it
    };

    ws.onmessage = (event) => {
      try {
        const message: MessageBroadcast = JSON.parse(event.data);
        this.messageSubject.next(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      // Attempt reconnection after delay
      setTimeout(() => this.connect(this.userId!), 3000);
    };

    this.socket = ws;
  }

  sendMessage(roomId: string, content: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const message = { room_id: roomId, content };
      this.socket.send(JSON.stringify(message));
    }
  }

  getMessages(): Observable<MessageBroadcast> {
    return this.messageSubject.asObservable();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
```

### 3. Room Service
Handle room creation and listing:

```typescript
// src/app/services/room.service.ts
@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(private http: HttpClient, private authService: AuthService) {}

  createRoom(name: string): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(
      'http://localhost:8080/rooms',
      { name, is_dm: false },
      { headers: this.authService.getAuthHeaders() }
    );
  }

  createDM(receiverId: string): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(
      'http://localhost:8080/rooms/dm',
      { receiver_id: receiverId },
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getPublicRooms(): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>(
      'http://localhost:8080/rooms',
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getUserDMs(): Observable<RoomResponse[]> {
    return this.http.get<RoomResponse[]>(
      'http://localhost:8080/rooms/dm',
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getRoomHistory(roomId: string): Observable<MessageBroadcast[]> {
    return this.http.get<MessageBroadcast[]>(
      `http://localhost:8080/history?room_id=${roomId}`,
      { headers: this.authService.getAuthHeaders() }
    );
  }
}
```

### 4. User Service
Handle user-related operations:

```typescript
// src/app/services/user.service.ts
@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient, private authService: AuthService) {}

  getUser(userId: string): Observable<UserResponse> {
    return this.http.get<UserResponse>(
      `http://localhost:8080/users?user_id=${userId}`,
      { headers: this.authService.getAuthHeaders() }
    );
  }

  getOnlineUsers(): Observable<string[]> {
    return this.http.get<string[]>(
      'http://localhost:8080/users/online',
      { headers: this.authService.getAuthHeaders() }
    );
  }
}
```

### 5. Component Structure
Recommended Angular component structure:

```
src/app/
├── components/
│   ├── auth/
│   │   ├── login/
│   │   └── register/
│   ├── chat/
│   │   ├── room-list/
│   │   ├── room-header/
│   │   ├── message-list/
│   │   └── message-input/
│   ├── layout/
│   │   ├── header/
│   │   └── sidebar/
│   └── shared/
├── services/
├── models/
└── app.component.ts
```

### 6. Routing Structure
```typescript
// src/app/app-routing.module.ts
const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'chat', component: ChatLayoutComponent, canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'rooms', pathMatch: 'full' },
      { path: 'rooms', component: RoomListComponent },
      { path: 'dm', component: DMListComponent },
      { path: 'room/:id', component: ChatRoomComponent }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
```

### 7. State Management
Consider using NgRx or a simple service-based approach for managing:
- Current user profile
- Selected room
- Message cache
- Online users list

### 8. Styling with Tailwind
The frontend uses Tailwind CSS. Key classes to use:
- Layout: `flex`, `h-screen`, `overflow-hidden`
- Chat messages: `p-4`, `rounded-lg`, `max-w-xs`
- Input fields: `border`, `p-2`, `rounded`, `focus:outline-none`
- Buttons: `bg-blue-500`, `hover:bg-blue-600`, `text-white`, `px-4`, `py-2`

### 9. Error Handling
Implement consistent error handling:
- HTTP 401: Redirect to login
- HTTP 409: Show conflict error (e.g., username/room already exists)
- HTTP 500: Show generic error message
- WebSocket errors: Attempt reconnection with exponential backoff

### 10. Security Considerations
- Store JWT securely (consider using HttpOnly cookies if Tauri allows)
- Sanitize user input to prevent XSS
- Implement rate limiting on client-side for message sending
- Validate all inputs before sending to backend

## Development Setup

### Prerequisites
- Node.js (for Angular development)
- Rust toolchain (for Tauri backend)
- Go backend running on localhost:8080

### Development Commands
```bash
# Install dependencies
npm install

# Start Angular dev server (for web debugging)
ng serve

# Build and run Tauri app
npm run tauri dev

# Build for production
npm run tauri build
```

### Environment Configuration
Create `.env` file for API URL:
```
VITE_API_URL=http://localhost:8080
```

## Testing Strategy

### Unit Tests
- Services: Test HTTP request handling
- Components: Test UI interactions and template rendering
- Pipes: Test data transformation logic

### E2E Tests
- User registration and login flow
- Room creation and messaging
- WebSocket connection and real-time updates
- Authentication protection

## Deployment
The Tauri application can be built for:
- Windows (.exe)
- macOS (.app)
- Linux (.AppImage)

Refer to Tauri documentation for specific build commands and signing requirements.

## API Change Log
If the backend API changes, update:
1. Service methods signatures
2. DTO interfaces
3. Error handling logic
4. WebSocket message format (if changed)

## Troubleshooting
- **Connection refused**: Ensure backend is running on localhost:8080
- **Authentication failed**: Check token storage and header transmission
- **WebSocket not connecting**: Verify URL and protocol (ws:// vs wss://)
- **Message not appearing**: Check room ID matching and participant validation