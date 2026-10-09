# AGENTS.md

## Project overview

Calling is a proof-of-concept internal chat application. The repository contains a Go backend and a Tauri/Angular desktop client.

**Backend (Go 1.26.4)**
- HTTP router: `go-chi/chi/v5`
- WebSocket transport: `gorilla/websocket`
- Database: PostgreSQL 16 via Docker Compose
- Database driver/pool: `pgx/v5`
- Generated database access: `sqlc`
- Dependency injection: `go.uber.org/dig`
- Password hashing: bcrypt through `golang.org/x/crypto`
- Validation: `go-playground/validator/v10`
- JWT: `github.com/golang-jwt/jwt/v5` (HS256)

**Frontend (`chat-frontend`)**
- Tauri 2 shell (Rust) with an Angular 22 standalone-component client
- UI kit: zard/ui components installed as source under `src/app/shared/components`
- Styling: Tailwind CSS v4 (tokens in `src/styles.css`), `tailwind-merge`/`clsx` via the shared `mergeClasses` helper
- Icons: `@ng-icons/core` with the `lucide` family
- HTTP: `@angular/common/http` with a functional interceptor
- Forms: Angular reactive forms
- Tests: none configured in the frontend yet

The Go module is `chat-backend`. The workspace at the repository root includes `./chat-backend`. The Angular client is a standalone npm project under `./chat-frontend` and is not part of the Go workspace.

## Repository layout

```text
Calling/
├── docs/
│   └── PRIME-NG.md         # PrimeNG documentation
├── README.md                 # Product description, architecture, API, and setup notes
├── RELEASE_NOTES_v1.0.0.md   # GitHub release notes for the v1.0.0 milestone
├── AGENTS.MD                 # This file
├── go.work                   # Go workspace; uses ./chat-backend
├── chat-backend/
│   ├── cmd/server/main.go    # Application entry point, middleware, routes, server startup
│   ├── db/
│   │   ├── schema.sql        # PostgreSQL schema and indexes
│   │   └── queries.sql       # sqlc query sources
│   ├── docker-compose.yml    # PostgreSQL 16 development container
│   ├── go.mod                # Module and dependency declarations
│   ├── go.sum
│   ├── sqlc.yaml             # sqlc generation configuration
│   └── internal/
│       ├── auth/
│       │   ├── jwt.go        # JWT Claims struct and token generation (HS256)
│       │   └── middleware.go # JWT validation middleware and context helpers
│       ├── chat/
│       │   ├── handler.go    # HTTP handlers and WebSocket lifecycle/message routing
│       │   ├── service.go    # Chat business rules
│       │   └── repository.go # Chat persistence abstraction and PostgreSQL implementation
│       ├── container/
│       │   └── container.go  # dig dependency graph
│       ├── database/
│       │   ├── postgres.go   # pgx connection-pool creation and configuration
│       │   └── sqlc/         # Generated sqlc code; do not edit manually
│       ├── httputil/
│       │   └── validator.go  # Generic JSON decoding and DTO validation helpers
│       ├── models/
│       │   ├── models.go     # Chat request/response/domain DTOs
│       │   └── validation.go # Validation implementations for chat DTOs
│       └── user/
│           ├── handler.go    # User HTTP endpoints (register, login, get)
│           ├── models.go     # User entities, roles, and request/response DTOs
│           ├── repository.go # User persistence abstraction and PostgreSQL implementation
│           ├── service.go    # Registration, bcrypt, login, and user lookup rules
│           └── validation.go # Validation implementations for user DTOs
└── chat-frontend/
    ├── angular.json          # Angular workspace config
    ├── components.json       # zard-cli config (base URL, aliases, icon family)
    ├── package.json          # npm scripts and dependencies
    ├── src/
    │   ├── main.ts
    │   ├── index.html
    │   ├── styles.css        # Tailwind v4 theme tokens and global base rules
    │   ├── environments/
    │   │   ├── environment.ts
    │   │   └── environment.prod.ts
    │   └── app/
    │       ├── app.component.ts        # Root shell: title bar + routed view
    │       ├── app.config.ts           # Providers, HTTP interceptors, app initializer
    │       ├── app.routes.ts           # Route table and guards
    │       ├── components/
    │       │   ├── auth/
    │       │   │   ├── login/           # Login screen (templateUrl: .html)
    │       │   │   └── register/        # Register screen (templateUrl: .html)
    │       │   ├── chat/               # Chat shell, room list (create-room action), DM list, room view, composer
    │       │   ├── dialog/             # Dialog-driven views (new conversation, new room)
    │       │   ├── settings/
    │       │   │   ├── settings-registry.ts       # Categories → groups → settings tree
    │       │   │   ├── settings-dialog/          # Two-pane settings modal with search
    │       │   │   └── server-address/           # Backend-address page with a connection probe
    │       │   └── layout/
    │       │       ├── header/          # App bar (sidebar toggle, account menu, logout)
    │       │       ├── sidebar/         # Conversation rail
    │       │       └── titlebar/        # Custom window chrome (drag region + window buttons)
    │       ├── guards/
    │       │   └── auth.guard.ts       # authGuard (requires session), guestGuard (rejects one)
    │       ├── interceptors/
    │       │   └── auth.interceptor.ts # Clears the session on 401 and redirects to login
    │       ├── services/
    │       │   ├── api.service.ts      # Thin HTTP wrapper over the resolved backend address
    │       │   ├── api-config.service.ts # Backend address resolution and persistence
    │       │   ├── auth.service.ts      # Login/register calls and session storage
    │       │   ├── conversation.service.ts # Signed-in user's DM directory
    │       │   ├── room.service.ts      # Room and history endpoints
    │       │   ├── theme.service.ts     # Dark-mode state, persistence, and OS-preference following
    │       │   ├── user.service.ts      # User directory and presence
    │       │   ├── websocket.service.ts # App-scoped chat socket
    │       │   └── window.service.ts    # Per-route window sizing and window controls
    │       ├── shared/                  # zard/ui components and shared utilities
    │       └── types/                   # Ambient DTO interfaces
    └── src-tauri/
        ├── Cargo.toml
        ├── tauri.conf.json       # Window geometry, `decorations: false`, bundle config
        ├── capabilities/
        │   └── default.json      # Window/capability permissions for the main window
        └── src/
            └── lib.rs            # Tauri commands (`greet`, `get_api_url`) and `run`
```

## Architecture and request flow

The backend follows a handler → service → repository separation:

1. `cmd/server/main.go` creates the chi router, logging/recovery/CORS middleware, the JWT auth middleware, and the dig container.
2. `internal/container` wires the pgx pool, JWT signing secret, auth middleware, user repository/service/handler, and chat repository/service/manager.
3. Handlers decode HTTP or WebSocket input and validate DTOs.
4. Services implement business rules and call repository interfaces.
5. Repositories use generated sqlc queries backed by a shared `pgxpool.Pool`.
7. `internal/auth/jwt.go` provides the `GenerateToken` function and `Claims` struct for JWT issuance.
8. `internal/auth/middleware.go` provides `Middleware(secret)` which validates the `Authorization: Bearer <token>` header and stores the user ID in the request context.
9. `chat-backend` is the only Go module. The desktop client is a separate npm project (`chat-frontend`) and is not in the Go workspace.
10. On the client, `chat-frontend/src/app/app.component.ts` renders `TitleBarComponent` above the routed view and drives `WindowService.applyRoute` from `NavigationEnd`.
11. `chat-frontend/src/app/services/` holds the client's equivalent of the handler→service→repository chain: components call services, services call `ApiService` (authenticated) or `HttpClient` (public), and `ApiService` resolves the backend address through `ApiConfigService`.

Keep dependencies flowing inward. Handlers should not issue SQL directly, services should not depend on concrete PostgreSQL types, and repositories should hide sqlc-to-domain mapping. On the client, components should not build URLs and should not read storage directly; go through `ApiService` and `AuthService`.

## Current API and behavior

Routes are registered in `cmd/server/main.go`:

- `POST /users` — register a user (public)
- `POST /users/login` — validate credentials and issue a JWT (public)
- `GET /users` — dual-purpose: with `?user_id=` it returns that single user, without it the full user directory (`UserResponse[]`, ordered by username, no password column) — requires JWT
- `GET /history?room_id=` — retrieve room history — requires JWT
- `GET /users/online` — list connected user IDs — requires JWT
- `GET /chat` — WebSocket upgrade; user identity is extracted from the JWT — requires JWT
- `POST /rooms` — create a room/channel — requires JWT
- `GET /rooms` — list public rooms only — requires JWT
- `POST /rooms/dm` — create a DM with `receiver_id` in the JSON body — requires JWT
- `GET /rooms/dm` — list DMs involving the authenticated user, each carrying the other participant (`other_user_id`, `other_username`, `other_name`) alongside the usual room fields — requires JWT

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
- `ListUsers` is the only user query that omits `password`, so sqlc generates a dedicated `ListUsersRow` instead of reusing `sqlc.User`; the repository maps it explicitly.
- `ListUserDMs` joins the other participant's `users` row. A DM room name is only the two user IDs, so without that join the client cannot tell which conversation belongs to which person. `ListUserDMsRow` is mapped into `models.DMRoomResponse`, which embeds `RoomResponse` so the existing room fields stay flat in JSON.
- IDs are currently generated as `time.Now().UnixNano()` strings in services, not database-generated UUIDs.
- DMs use a canonical room name based on lexicographic ordering: `{smaller_user_id}-{larger_user_id}`.
- Database initialization is mounted into the Postgres container and runs automatically only when the database volume is initialized. If schema changes appear ineffective, recreate the development volume deliberately.
- `database.NewPool` reads `DATABASE_URL`, falling back to `postgres://postgres:postgres@localhost:5432/calling_chat?sslmode=disable`.

When a repository operation needs multiple related writes, consider transaction boundaries and cleanup behavior; the current room creation implementation creates a room and then inserts participants without an explicit transaction.

## Desktop client configuration

The client resolves the backend address once, in `ApiConfigService.init()`, which runs as an Angular app initializer so no request leaves before it settles. Precedence:

1. `CALLING_API_URL` in the process environment. The webview cannot read the environment the app was launched from, so `src-tauri/src/lib.rs` exposes a `get_api_url` command that reads the variable. A set variable is treated as an operator decision and locks the address — the screen renders read-only and `ApiConfigService.setApiUrl` ignores writes.
2. A client-side address the user typed on `/settings/server`, persisted in `localStorage` under `calling_api_url`.
3. `environment.apiUrl` as the compiled-in default.

`ApiConfigService.needsSetup` is true while the source is still the compiled-in default; the login and register screens use it to prompt for an address instead of letting the first request fail. The route is `guestGuard`-only, because retargeting the backend mid-session would send a token issued by one server to another.

Addresses are normalized by `ApiConfigService.normalize`: a missing scheme becomes `http://`, a trailing slash is dropped, and only the origin is kept. `websocketBase()` derives the `ws://`/`wss://` equivalent for the chat socket.

Native window decorations are disabled (`decorations: false` in `tauri.conf.json`), so `TitleBarComponent` supplies the drag region and the minimize/maximize/close buttons. It is rendered only when `isTauri()` is true, so browser development is not left with dead window chrome. `WindowService` pins the auth routes (`/login`, `/register`, `/settings/server`) to 480x720 and maximizes the app routes. Pinning is done with `setMinSize`/`setMaxSize` to the same value rather than `resizable: false` alone: `resizable: false` only disables dragging the edge, leaving the OS free to restore whatever geometry it had before — which is why the window came back at its maximized size after leaving the chat. The constraints must be lifted (`setMinSize(null)`) before maximizing, or the maximize call is clamped. Leaving a maximized window also needs `unmaximize` to settle before resizing, since Windows applies the restore asynchronously.

Windows open centered. `center: true` in `tauri.conf.json` covers creation, and `WindowService.applyStartup()` covers the startup handoff — a session restored straight into the chat maximizes, and the window should not sit wherever the OS placed it before that landed. Restoring from maximized (`toggleMaximize`) re-centers too, since a normal-sized window that lands on remembered geometry can be off-screen. Restoring can also come from the OS — `Win+Down` on Windows — which never goes through `toggleMaximize`, so `WindowService.watchRestore()` listens for the resize event and re-applies the constraints on that path. Windows restores the geometry it remembered before maximizing, which can be the 480x720 auth size and therefore under the 800x600 app floor; `setMinSize` only constrains future interactive drags and never corrects the geometry the OS just applied, so `enforceMinFloor()` reads the current size and grows the window back to the floor on every restore path. Every window command used needs a matching entry in `src-tauri/capabilities/default.json`; Tauri denies undeclared commands at runtime rather than failing the build.

The chat history pins itself to the latest message with a `ResizeObserver` on the content wrapper inside the scroll viewport, not with an `effect` over the message signals. An effect cannot work here: it runs before the template has rendered, so the elements it needs do not exist yet and no later signal change re-triggers it — the history stays at the top until an unrelated interaction causes a re-render. Deferring with `afterNextRender` does not fix it either, because that still couples the scroll to Angular's render scheduling rather than to the content's actual size. The observer fires after layout, so the height it reads is final. It is attached in `ngAfterViewInit` and disconnected in `ngOnDestroy`, and guards on a `following` flag driven by the viewport's `scroll` event so reading history is not interrupted by an incoming message; sending re-attaches the viewport regardless. The jump uses `scrollTo({ top: scrollHeight })` rather than assigning `scrollTop`, since `scrollHeight` is the content height and assigning it overshoots by the viewport height. The `sm:max-w-sm` cap in the vendored `dialog.variants.ts` overrides any `zWidth`, so a wider dialog needs `zCustomClasses` alongside it — `mergeClasses` resolves the conflict without editing generated zard source.

The root layout lives in `app.component.css`, not in a `host` class. Angular rewrites `:host` to the `_nghost-*` attribute selector, giving it the same specificity as a utility class, so a `flex` host class loses on source order — and because the routed outlet relies on `flex-1`, a non-flex parent silently collapses the app to content height instead of failing visibly.

## Theming and settings

Dark mode is a `dark` class on `document.documentElement`; `styles.css` already defines a full `.dark` token set, so toggling the class repaints the app with no per-component state. `ThemeService.init()` runs as an app initializer to avoid a light-mode flash on first paint. It persists an explicit choice in `localStorage` under `calling_theme`, and only falls back to `prefers-color-scheme` — with a live listener — while nothing has been chosen.

Settings are a tree of categories → groups → settings declared in `settings-registry.ts`, and `SettingsDialogComponent` renders that tree generically: adding a setting is a data change, not a template change. The registry is built through an `Injector` because the module is evaluated at import time, outside any injection context, so `ThemeService` can only be resolved when a control is read or written.

The dialog's search filters the tree rather than a flat list: a category stays visible when its own label matches *or* when any nested setting matches, and the selection jumps to the first surviving category. Searching for a term that only appears on a nested setting would otherwise hide the one category that owns it.

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

From `Calling/chat-frontend`:

```bash
# Serve the Angular client in a browser (no Tauri window)
npm start

# Build the client
npm run build

# Run the desktop shell (starts the client dev server too)
npm run tauri dev

# Type-check the Rust side
cd src-tauri && cargo check
```

`serve.options.host` is pinned to `127.0.0.1` in `angular.json`, and it must stay there. The Angular dev server otherwise binds `[::1]` only, while Tauri's WebView2 resolves `localhost` to IPv4 first — so it connects to a port nobody is listening on and the window renders blank. The packaged build is unaffected because it serves from disk, which is why this shows up in dev alone.

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

`chat.Manager` owns the in-memory map of live WebSocket clients and routes persisted messages. The map is keyed by user ID and each entry holds a *set* of connections, so one user may hold several sockets at once; a user is online while at least one is open, and closing one window must not deregister the others.

On the client, `WebSocketService` reconnects on its own after a drop. It exposes `connected` and `everConnected` separately because `connected` alone cannot tell "the server just went away" from "the first handshake has not finished yet": the header shows **Sem conexão — reconectando...** only once `everConnected` is true, and **Conectando...** before that. A send attempted while the socket is down is not dropped — `ChatRoomComponent` parks the text in `pendingMessage` and offers a retry, and clears it on a room change so it cannot be sent to the wrong conversation.

The current upgrader accepts every origin (`CheckOrigin` returns true), and CORS allows all origins. This is acceptable only for the POC/local setup; do not treat it as production security.

## Security and known roadmap items

- Login issues a JWT (HS256) valid for 1 hour; the signing secret defaults to a development value and should be set via `JWT_SECRET` in production.
- All routes except `/users` (register) and `/users/login` are now protected by JWT middleware. The `user_id` query-parameter identity flow has been replaced with token-based authentication.
- A browser WebSocket handshake cannot set request headers, so `auth.Middleware` also accepts the token as a `?token=` query parameter, restricted to requests carrying an `Upgrade: websocket` header. Ordinary HTTP requests still require the `Authorization` header, because query strings reach proxy and access logs.
- The frontend keeps the session in `localStorage`, so a restart resumes the signed-in user instead of returning to login. The cost is that storage is shared by every window of an origin, so a second login in another window replaces the first window's identity.
- A stored token is treated as a claim that a session *may* exist, never as proof. `authGuard` only checks that a token and user were persisted; `authInterceptor` clears the session and redirects to `/login` on any `401` from a non-login endpoint. Login and register are excluded from that rule because a wrong password is also a 401.
- `guestGuard` keeps a signed-in user off the login and register screens.
- Login and register split their feedback in two: field validation renders in `z-field-error` under its own input, while the server's rejection renders once below the fields, because it belongs to no single input.
- The server-address connection probe uses raw `fetch` rather than `HttpClient`. Any HTTP status counts as reachable — a 401 from `/users/online` still proves a server is there — but routing it through `HttpClient` would let that 401 reach `authInterceptor` and sign the user out over a connectivity check.
- CORS and WebSocket origin checks are permissive.
- The client validates credentials against the backend's own constraints rather than duplicating them as its own source of truth; the constants (`USERNAME_MIN`, `PASSWORD_MIN`, and so on) mirror the Go DTO tags and must be changed together with them.
- The frontend has no tests configured.

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

## Large Modification Suggestion

When making significant changes to the codebase (new features, architecture changes, or multiple file modifications), consider updating the release version using the `update-release-version` skill. This ensures consistency across `package.json`, `tauri.conf.json`, `Cargo.toml`, and the release notes file.

## Change checklist

Before completing a change:

1. Read the relevant handler, service, repository interface, SQL query, and model files.
2. Make the smallest change that preserves the existing layering.
3. Update `db/schema.sql`/`db/queries.sql` together when persistence behavior changes.
4. Regenerate sqlc code after SQL changes; never hand-edit generated output.
5. Run `gofmt` on changed Go files.
6. Review and update `AGENTS.MD` for every project modification; keep its structure, behavior, commands, and constraints accurate.
7. Update `README.md` or other user-facing documentation when API, setup, or product behavior changes.
8. Run targeted tests, then `go test ./...` and/or `go build ./...` when practical. For client changes, run `npx ng build` and `cargo check` in `chat-frontend`.
9. Report any unavailable tooling, database dependency, or pre-existing failures accurately.
