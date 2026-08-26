# AGENTS.md

## Project overview

Calling is a proof-of-concept internal chat application. The repository currently contains only the Go backend; the planned Tauri/Rust frontend does not exist yet.

- Backend: Go 1.26.4
- HTTP router: `go-chi/chi/v5`
- WebSocket transport: `gorilla/websocket`
- Database: PostgreSQL 16 via Docker Compose
- Database driver/pool: `pgx/v5`
- Generated database access: `sqlc`
- Dependency injection: `go.uber.org/dig`
- Password hashing: bcrypt through `golang.org/x/crypto`
- Validation: `go-playground/validator/v10`
- JWT: `github.com/golang-jwt/jwt/v5` (HS256)

The Go module is `chat-backend`. The workspace at the repository root includes `./chat-backend`.

## Repository layout

```text
Calling/
├── README.md                 # Product description, architecture, API, and setup notes
├── AGENTS.MD                 # This file
├── go.work                   # Go workspace; uses ./chat-backend
└── chat-backend/
    ├── cmd/server/main.go    # Application entry point, middleware, routes, server startup
    ├── db/
    │   ├── schema.sql        # PostgreSQL schema and indexes
    │   └── queries.sql       # sqlc query sources
    ├── docker-compose.yml    # PostgreSQL 16 development container
    ├── go.mod                # Module and dependency declarations
    ├── go.sum
    ├── sqlc.yaml             # sqlc generation configuration
    └── internal/
        ├── auth/
        │   ├── jwt.go        # JWT Claims struct and token generation (HS256)
        │   └── middleware.go # JWT validation middleware and context helpers
        ├── chat/
        │   ├── handler.go    # HTTP handlers and WebSocket lifecycle/message routing
        │   ├── service.go    # Chat business rules
        │   └── repository.go # Chat persistence abstraction and PostgreSQL implementation
        ├── container/
        │   └── container.go  # dig dependency graph
        ├── database/
        │   ├── postgres.go   # pgx connection-pool creation and configuration
        │   └── sqlc/         # Generated sqlc code; do not edit manually
        ├── httputil/
        │   └── validator.go  # Generic JSON decoding and DTO validation helpers
        ├── models/
        │   ├── models.go     # Chat request/response/domain DTOs
        │   └── validation.go # Validation implementations for chat DTOs
        └── user/
            ├── handler.go    # User HTTP endpoints (register, login, get)
            ├── models.go     # User entities, roles, and request/response DTOs
            ├── repository.go # User persistence abstraction and PostgreSQL implementation
            ├── service.go    # Registration, bcrypt, login, and user lookup rules
            └── validation.go # Validation implementations for user DTOs
```

## Architecture and request flow

The backend follows a handler → service → repository separation:

1. `cmd/server/main.go` creates the chi router, logging/recovery/CORS middleware, the JWT auth middleware, and the dig container.
2. `internal/container` wires the pgx pool, JWT signing secret, auth middleware, user repository/service/handler, and chat repository/service/manager.
3. Handlers decode HTTP or WebSocket input and validate DTOs.
4. Services implement business rules and call repository interfaces.
5. Repositories use generated sqlc queries backed by a shared `pgxpool.Pool`.
6. `internal/auth/jwt.go` provides the `GenerateToken` function and `Claims` struct for JWT issuance.
7. `internal/auth/middleware.go` provides `Middleware(secret)` which validates the `Authorization: Bearer <token>` header and stores the user ID in the request context.
8. `internal/chat.Manager` owns the in-memory map of active WebSocket clients and routes persisted messages.

Keep dependencies flowing inward. Handlers should not issue SQL directly, services should not depend on concrete PostgreSQL types, and repositories should hide sqlc-to-domain mapping.

## Current API and behavior

Routes are registered in `cmd/server/main.go`:

- `POST /users` — register a user (public)
- `POST /users/login` — validate credentials and issue a JWT (public)
- `GET /users` — retrieve a user by id (`?user_id=`) — requires JWT
- `GET /history?room_id=` — retrieve room history — requires JWT
- `GET /users/online` — list connected user IDs — requires JWT
- `GET /chat` — WebSocket upgrade; user identity is extracted from the JWT — requires JWT
- `POST /rooms` — create a room/channel — requires JWT
- `GET /rooms` — list public rooms only — requires JWT
- `POST /rooms/dm` — create a DM with `receiver_id` in the JSON body — requires JWT
- `GET /rooms/dm` — list DMs involving the authenticated user — requires JWT

All routes except `/users` (register) and `/users/login` are protected by the JWT middleware.

WebSocket clients send JSON shaped like:

```json
{"room_id":"<room_id>","content":"Hello, world!"}
```

Public-room messages are broadcast to other connected clients. DM messages are sent only to the other participant. Messages are validated, stored, then routed. Validation and service errors are sent back as JSON over the originating WebSocket.

## JWT authentication

- `internal/auth/jwt.go` defines a `Claims` struct embedding `jwt.RegisteredClaims` with `UserID` and `Username` fields, and a `GenerateToken(secret, userID, username)` function.
- Tokens are signed with HMAC SHA-256 (HS256) and expire after 1 hour.
- The signing secret is read from the `JWT_SECRET` environment variable; if unset, a development default (`dev-secret-change-me`) is used.
- `internal/auth/middleware.go` provides `Middleware(secret)` which validates the `Authorization: Bearer <token>` header and stores the user ID in the request context via `UserIDFromContext`.
- `POST /users/login` validates credentials via the user service, then calls `auth.GenerateToken` and returns `{ "token": "...", "user": {...} }` with a 200 OK.
- All routes except `/users` (register) and `/users/login` are protected by the JWT middleware.
- The WebSocket `/chat` endpoint extracts the user ID from the JWT context (no `user_id` query parameter needed).
- The `Authorization` header is now included in CORS allowed headers.

## Database and sqlc rules

- PostgreSQL schema source: `chat-backend/db/schema.sql`.
- Query source: `chat-backend/db/queries.sql`.
- Generated output: `chat-backend/internal/database/sqlc`.
- After changing the schema or queries, run `sqlc generate` from `chat-backend`.
- Never edit files under `internal/database/sqlc` by hand; regenerate them.
- Tables are `users`, `rooms`, `room_participants`, and `messages`.
- IDs are currently generated as `time.Now().UnixNano()` strings in services, not database-generated UUIDs.
- DMs use a canonical room name based on lexicographic ordering: `{smaller_user_id}-{larger_user_id}`.
- Database initialization is mounted into the Postgres container and runs automatically only when the database volume is initialized. If schema changes appear ineffective, recreate the development volume deliberately.
- `database.NewPool` reads `DATABASE_URL`, falling back to `postgres://postgres:postgres@localhost:5432/calling_chat?sslmode=disable`.

When a repository operation needs multiple related writes, consider transaction boundaries and cleanup behavior; the current room creation implementation creates a room and then inserts participants without an explicit transaction.

## Development commands

From `Calling/chat-backend`:

```bash
# Start PostgreSQL
docker compose up -d

# Run the server
go run ./cmd/server

# Format Go files
gofmt -w ./cmd ./internal

# Run all Go tests (there are currently no test files in the repository)
go test ./...

# Build all packages
go build ./...

# Regenerate database code after db/schema.sql or db/queries.sql changes
sqlc generate
```

From the repository root, workspace-aware Go commands can also be used, for example `go test ./...` if the installed Go version supports the workspace layout.

## Go conventions

- Use standard Go formatting and idiomatic error handling.
- Preserve the existing package organization and interface-based dependency boundaries.
- Prefer `context.Context` passed from handlers into services and repositories. Database work should have bounded contexts where appropriate.
- Use the existing `httputil.ReadAndValidate` and `UnmarshalValidate` helpers for DTOs implementing `Validate() error`.
- Keep passwords out of API responses; `user.User.Password` has a `json:"-"` tag and handlers return `UserResponse`.
- Keep domain/user DTOs in their existing packages rather than coupling them to generated sqlc models.
- Use sentinel or prefixed errors consistently with current handlers (`conflict:`, `not_found:`, `unauthorized:`, and `forbidden:`), or improve the error taxonomy consistently across the affected layer.
- Do not add comments that merely restate code. Comments should explain non-obvious constraints or temporary POC behavior.
- Add tests for new business rules, especially DM authorization, canonical naming, validation, and message routing. Prefer service tests with mocked repository interfaces before integration tests.

## WebSocket/concurrency notes

`chat.Manager` protects its `clients` map with `sync.RWMutex`. Be careful when changing connection registration, cleanup, or broadcast logic. A WebSocket connection must not be used for concurrent writes unless write access is coordinated; preserve or improve this guarantee when adding asynchronous delivery.

The current implementation allows one active connection per user ID because the map is keyed by user ID. Replacing a connection or supporting multiple devices would require an explicit lifecycle design.

The current upgrader accepts every origin (`CheckOrigin` returns true), and CORS allows all origins. This is acceptable only for the POC/local setup; do not treat it as production security.

## Security and known roadmap items

- Login issues a JWT (HS256) valid for 1 hour; the signing secret defaults to a development value and should be set via `JWT_SECRET` in production.
- All routes except `/users` (register) and `/users/login` are now protected by JWT middleware. The `user_id` query-parameter identity flow has been replaced with token-based authentication.
- The WebSocket endpoint extracts the user ID from the JWT context rather than a query parameter.
- CORS and WebSocket origin checks are permissive.
- Planned roadmap work includes a Tauri frontend.

Do not silently represent the current query-parameter identity flow as secure authentication. If implementing auth, update handlers, route protection, WebSocket authentication, API documentation, and tests together.

## Documentation synchronization requirement

Every project modification must include a documentation review. After changing code, SQL, dependencies, configuration, routes, behavior, or repository structure, update this `AGENTS.MD` in the same change whenever its description, instructions, examples, architecture notes, known limitations, or file tree is no longer accurate.

Keep `AGENTS.MD` synchronized with the actual repository rather than treating it as a one-time snapshot. In particular:

- Update the repository tree when files or directories are added, removed, moved, or renamed.
- Update architecture and request-flow guidance when responsibilities, dependencies, or package boundaries change.
- Update API, WebSocket, database, setup, and command sections when externally visible behavior or developer workflow changes.
- Update known limitations, security notes, roadmap items, and technology versions when project status changes.
- If a modification is documentation-only or does not make this file stale, still review this section and leave the file unchanged only when it remains accurate.
- Do not remove this requirement when restructuring or rewriting the guide.

## Change checklist

Before completing a change:

1. Read the relevant handler, service, repository interface, SQL query, and model files.
2. Make the smallest change that preserves the existing layering.
3. Update `db/schema.sql`/`db/queries.sql` together when persistence behavior changes.
4. Regenerate sqlc code after SQL changes; never hand-edit generated output.
5. Run `gofmt` on changed Go files.
6. Review and update `AGENTS.MD` for every project modification; keep its structure, behavior, commands, and constraints accurate.
7. Update `README.md` or other user-facing documentation when API, setup, or product behavior changes.
8. Run targeted tests, then `go test ./...` and/or `go build ./...` when practical.
9. Report any unavailable tooling, database dependency, or pre-existing failures accurately.
