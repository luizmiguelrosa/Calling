# AGENTS.md

## Project overview

Talk is a proof-of-concept internal chat application. The repository contains a Go backend and a Tauri/Angular desktop client.

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
- Native notifications: `tauri-plugin-notification` (Rust) + `@tauri-apps/plugin-notification` (JS)
- Native save dialog: `tauri-plugin-dialog` + `tauri-plugin-fs` (Rust) with `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` (JS)
- UI kit: zard/ui components installed as source under `src/app/shared/components`
- Styling: Tailwind CSS v4 (tokens in `src/styles.css`), `tailwind-merge`/`clsx` via the shared `mergeClasses` helper
- Icons: `@ng-icons/core` with the `lucide` family
- HTTP: `@angular/common/http` with a functional interceptor
- Forms: Angular reactive forms
- Tests: none configured in the frontend yet

The Go module is `chat-backend`. The workspace at the repository root includes `./chat-backend`. The Angular client is a standalone npm project under `./chat-frontend` and is not part of the Go workspace.

## Repository layout

```text
Talk/
├── docs/
│   └── PRIME-NG.md         # PrimeNG documentation
├── README.md                 # Product description, architecture, API, and setup notes
├── LICENSE                   # GNU Affero General Public License v3.0 (AGPL-3.0)
├── RELEASE_NOTES_v1.2.0.md   # GitHub release notes for the v1.2.0 milestone
├── AGENTS.MD                 # This file
├── go.work                   # Go workspace; uses ./chat-backend
├── chat-backend/
│   ├── cmd/server/main.go    # Application entry point, middleware, routes, server startup
│   ├── db/
│   │   ├── embed.go          # Embeds schema.sql + migrations.sql for startup
│   │   ├── migrations.sql    # Idempotent additive DDL for existing databases
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
│       │   ├── service.go    # Chat business rules (replies, room access, permissions)
│       │   └── repository.go # Chat persistence abstraction and PostgreSQL implementation
│       ├── admin/
│       │   ├── handler.go    # Admin HTTP endpoints (users, roles, rooms, permissions)
│       │   ├── models.go     # Admin DTOs and validation
│       │   ├── service.go    # Admin business rules, soft deletion, member management
│       │   └── repository.go # Admin persistence abstraction
│       ├── permissions/
│       │   ├── permissions.go  # Permission catalog, general and per-room checks
│       │   ├── middleware.go   # Require(permission) HTTP middleware
│       │   └── repository.go   # role_permissions/room_permissions/room_role_permissions access
│       ├── files/
│       │   ├── handler.go    # Upload/serve endpoints for room files and profile photos
│       │   ├── service.go    # File business rules, room access checks, URL paths, and format mapping
│       │   ├── service_test.go # Unit tests for extension handling and download headers
│       │   └── repository.go # files-table persistence abstraction and PostgreSQL implementation
│       ├── storage/
│       │   ├── storage.go    # Configurable file root and the rooms/users on-disk layout
│       │   └── image.go      # Profile-photo decode, center-crop, resize, and JPEG encoding
│       ├── container/
│       │   └── container.go  # dig dependency graph
│       ├── database/
│       │   ├── postgres.go   # pgx connection-pool creation and configuration
│       │   ├── migrate.go    # Applies the schema + migrations at startup
│       │   └── sqlc/         # Generated sqlc code; do not edit manually
│       ├── httputil/
│       │   └── validator.go  # Generic JSON decoding and DTO validation helpers
│       ├── models/
│       │   ├── models.go     # Chat request/response/domain DTOs
│       │   └── validation.go # Validation implementations for chat DTOs
│       └── user/
│           ├── bootstrap.go  # Creates the default system user on an empty database
│           ├── handler.go    # User HTTP endpoints (login, refresh, get, change password)
│           ├── models.go     # User entities, roles, and request/response DTOs
│           ├── repository.go # User persistence abstraction and PostgreSQL implementation
│           ├── service.go    # Credential validation, password change, and user lookup rules
│           └── validation.go # Validation implementations for user DTOs
└── chat-frontend/
    ├── angular.json          # Angular workspace config
    ├── components.json       # zard-cli config (base URL, aliases, icon family)
    ├── package.json          # npm scripts and dependencies
    ├── scripts/
    │   └── rename-bundle.mjs # Post-build rename of bundle artifacts + portable exe to `Talk_v<version>_<arch>`
    ├── src/
    │   ├── main.ts                 # Bootstraps the app and drops the pre-bootstrap splash
    │   ├── index.html              # Host page; carries the inline startup splash
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
    │       │   │   └── login/           # Login screen (templateUrl: .html)
    │       │   ├── admin/               # Admin shell + users/roles/rooms/permissions categories
    │       │   │   └── rooms/           # Room table, per-room permission editor, and the "Nova sala" dialog
    │       │   ├── chat/               # Chat shell, room list, DM list, room view, composer, context menu, image preview
    │       │   ├── dialog/             # Dialog-driven views (new conversation, mention, user info)
    │       │   ├── shared/
    │       │   │   └── user-avatar/     # Avatar for any user: cached profile photo + initials fallback
    │       │   ├── settings/
    │       │   │   ├── settings-registry.ts       # Categories → groups → settings tree
    │       │   │   ├── settings-dialog/          # Two-pane settings modal with search
    │       │   │   ├── change-password/          # Self-service password change dialog
    │       │   │   └── server-address/           # Backend-address page with a connection probe
    │       │   └── layout/
    │       │       ├── header/          # App bar (sidebar toggle, account menu with status, logout)
    │       │       ├── sidebar/         # Conversation rail
    │       │       ├── startup-loading/ # Full-screen splash while connecting at startup
    │       │       └── titlebar/        # Custom window chrome (drag region + window buttons)
    │       ├── guards/
    │       │   ├── auth.guard.ts       # authGuard (requires session), guestGuard (rejects one)
    │       │   ├── admin.guard.ts      # adminGuard (any admin capability), adminHomeGuard (first category), adminCategoryGuard (one category)
    │       │   └── startup.guard.ts    # Applies the startup preference on the first /chat navigation
    │       ├── interceptors/
    │       │   └── auth.interceptor.ts # Clears the session on 401 and redirects to login
    │       ├── services/
    │       │   ├── admin.service.ts    # Admin API transport (users, roles, rooms, permissions)
    │       │   ├── api.service.ts      # Thin HTTP wrapper over the resolved backend address
    │       │   ├── api-config.service.ts # Backend address resolution and persistence
    │       │   ├── auth.service.ts      # Login calls and session storage
    │       │   ├── conversation.service.ts # Signed-in user's DM directory
    │       │   ├── external-link.service.ts # Confirms and opens external links in the default browser
    │       │   ├── file.service.ts      # Room-file and profile-photo uploads
    │       │   ├── image-cache.service.ts # On-disk attachment cache (TTL, usage, background cleanup)
    │       │   ├── mention.service.ts   # Unread mention counts, watched on the app socket
    │       │   ├── notification.service.ts # Native notifications, unread counts, per-room mute
    │       │   ├── permission.service.ts # Cached general permissions for the signed-in user
    │       │   ├── room-navigation.service.ts # Last public room visited, for the sidebar's "Início" entry
    │       │   ├── room.service.ts      # Room and history endpoints
    │       │   ├── startup.service.ts   # Per-user startup preference and last-route restore
    │       │   ├── status.service.ts    # Own availability (online/away/dnd), persisted
    │       │   ├── theme.service.ts     # Dark-mode state, persistence, and OS-preference following
    │       │   ├── user.service.ts      # User directory and presence
    │       │   ├── websocket.service.ts # App-scoped chat socket
    │       │   └── window.service.ts    # Per-route window sizing, window controls, native attention
    │       ├── shared/                  # zard/ui components (incl. avatar, badge, button, card, checkbox, dialog, field, input, select, switch, sidebar, table) and shared utilities (incl. `utils/linkify.ts`, `utils/mentions.ts`, `utils/validation.ts`)
    │       └── types/                   # Ambient DTO interfaces (incl. `mention.type.ts`)
    └── src-tauri/
        ├── Cargo.toml
        ├── build.rs              # `tauri_build::build()` plus the icon rerun hint
        ├── tauri.conf.json       # Window geometry, `decorations: false`, bundle config
        ├── icons/                # Generated app/bundle icons; source is `Talk logo.png`
        ├── capabilities/
        │   └── default.json      # Window/capability permissions for the main window
        └── src/
            └── lib.rs            # Tauri commands (`greet`, `get_api_url`), plugins (opener, notification, dialog, fs), and `run`
```

## Architecture and request flow

The backend follows a handler → service → repository separation:

1. `cmd/server/main.go` creates the chi router, logging/recovery/CORS middleware, the JWT auth middleware, and the dig container.
2. `internal/container` wires the pgx pool, JWT signing secret, auth middleware, user repository/service/handler, chat repository/service/manager, permissions repository/service, and the admin repository/service/handler.
3. Handlers decode HTTP or WebSocket input and validate DTOs.
4. Services implement business rules and call repository interfaces.
5. Repositories use generated sqlc queries backed by a shared `pgxpool.Pool`.
7. `internal/auth/jwt.go` provides the `GenerateTokenPair` function, the `ParseToken` validator, and the `Claims` struct (which carries a `token_type`) for JWT issuance.
8. `internal/auth/middleware.go` provides `Middleware(secret)` which validates the `Authorization: Bearer <token>` header and stores the user ID in the request context.
9. `chat-backend` is the only Go module. The desktop client is a separate npm project (`chat-frontend`) and is not in the Go workspace.
10. On the client, `chat-frontend/src/app/app.component.ts` renders `StartupLoadingComponent` while the app is still connecting, then `TitleBarComponent` above the routed view, and drives `WindowService.applyRoute` from `NavigationEnd`. It also opens the app-scoped socket for a session restored from storage.
11. `chat-frontend/src/app/services/` holds the client's equivalent of the handler→service→repository chain: components call services, services call `ApiService` (authenticated) or `HttpClient` (public), and `ApiService` resolves the backend address through `ApiConfigService`.

Keep dependencies flowing inward. Handlers should not issue SQL directly, services should not depend on concrete PostgreSQL types, and repositories should hide sqlc-to-domain mapping. On the client, components should not build URLs and should not read storage directly; go through `ApiService` and `AuthService`.

## Current API and behavior

Routes are registered in `cmd/server/main.go`:

- `POST /users/login` — validate credentials and issue an access/refresh token pair (public)
- `POST /users/refresh` — exchange a refresh token for a new access/refresh pair (public)
- `GET /users` — dual-purpose: with `?user_id=` it returns that single user (or `null` once the account is soft-deleted), without it the full user directory (`UserResponse[]`, ordered by username, no password column) — requires JWT
- `PUT /users/me/password` — replace the signed-in user's password after verifying `current_password` — requires JWT
- `GET /me/permissions` — the signed-in user's granted general permissions — requires JWT
- `GET /roles` — role id/name/colour pairs, readable by any signed-in user for the user form's selector and for `@role:` mention resolution — requires JWT
- `GET /history?room_id=` — retrieve room history — requires JWT. Ordered by `sended_at, id`, so messages sharing a timestamp keep their insertion order and the client's ordering is stable across reloads. A restricted public room returns 403 without `room.view`.
- `GET /messages/{id}` — one message by id, used to quote a message that lives in another room — requires JWT
- `GET /users/online` — list connected user IDs — requires JWT
- `GET /chat` — WebSocket upgrade; user identity is extracted from the JWT — requires JWT
- `POST /rooms` — create a room/channel; requires the `rooms.create` permission. The chat shell no longer offers this action: the admin panel's Salas category opens it, and a role without `rooms.create` never sees the button — requires JWT
- `GET /rooms` — list public rooms the user may view — requires JWT
- `POST /rooms/dm` — create a DM with `receiver_id` in the JSON body — requires JWT
- `GET /rooms/dm` — list DMs involving the authenticated user, each carrying the other participant (`other_user_id`, `other_username`, `other_name`) alongside the usual room fields — requires JWT
- `POST /messages/batch` — store several messages for one room in a single request; each entry may reference a file uploaded beforehand and a `reply_to_id` — requires JWT
- `POST /rooms/{room_id}/files` — upload a room file (multipart `file` field); images are previewed inline, other types are downloaded; returns `{ id, file_name, path, hash, format }` — requires JWT
- `GET /files/rooms/{room_id}/{file_id}.{format}` — serve a room file, only to a user with access to the room — requires JWT
- `POST /users/me/photo` — upload a profile photo (multipart `file` field); converted to a fixed-size JPEG — requires JWT
- `GET /files/users/{user_id}.jpg` — serve a profile photo to any signed-in user — requires JWT

Admin routes (each requires the named general permission, enforced by `permissions.Require`; `permissions.RequireAny` is used where one route serves more than one category):

- `GET/POST /admin/users`, `PUT/DELETE /admin/users/{id}` — list, create, edit, and soft-delete users (`users.manage`)
- `GET/POST /admin/roles`, `GET/PUT/DELETE /admin/roles/{id}` — list, create, rename, and soft-delete roles (`roles.manage`)
- `DELETE /admin/roles/{id}/members/{userId}` — remove a member from a role (`roles.manage`)
- `PUT /admin/roles/{id}/permissions` — replace a role's general permissions (`roles.manage`)
- `GET /admin/rooms` — list public rooms; reachable with `rooms.view`, `rooms.edit`, or `rooms.create`, so an operator whose only room capability is creation can still load the category that contains the "Nova sala" dialog
- `GET /admin/rooms/{id}/permissions` — a room's explicit per-room grants (`rooms.view` or `rooms.edit`; creation alone does not expose them)
- `PUT /admin/rooms/{id}` and `PUT /admin/rooms/{id}/permissions` — rename a room and replace one user's or role's grants (`rooms.edit`)
- `GET /admin/permissions` — the general permission catalog (`roles.manage`)

All routes except `/users/login` and `/users/refresh` are protected by the JWT middleware. There is no self-registration endpoint; accounts are created from the admin panel.

WebSocket clients send JSON shaped like:

```json
{"room_id":"<room_id>","content":"Hello, world!"}
```

A file message carries `is_file` and the id of a file uploaded through the room's file endpoint:

```json
{"room_id":"<room_id>","content":"caption","is_file":true,"file_id":"<id>"}
```

A reply carries the id of the message it quotes:

```json
{"room_id":"<room_id>","content":"concordo","reply_to_id":42}
```

Public-room messages are broadcast to other connected clients. DM messages are sent only to the other participant. Messages are validated, stored, then routed. Validation and service errors are sent back as JSON over the originating WebSocket.

The server now includes the stored `id` on every broadcast and history row, and resolves `reply_to` into a snapshot (`id`, `room_id`, `author`, `content`, `is_file`) at delivery time. A reply can quote a message from another room: `buildStored` only checks that the parent exists, which is what lets "Reply in private" carry a public-room quote into a DM.

The chat header titles itself from the DM peer or the public room name. `ChatRoomComponent` resolves the public name from the `GET /rooms` list, and refetches that list on every room change rather than once at construction: the router reuses the component across public-room navigations (`/chat/rooms/:id` shares one route config), so a room created after the instance was built would otherwise be missing and the header would fall back to `Conversa` until the component was recreated — which is why opening a DM and returning appeared to fix it.

The sidebar's "Início" entry returns to the last public room visited rather than the bare room list. `RoomNavigationService` holds that room id, persisted in `localStorage` under `talk_last_room`; `RoomListComponent` records it from the URL (so only public rooms qualify — the DM route is a different path), and the sidebar's `homePath` computed appends it to `/chat/rooms` when set.

A history row now carries its stored id, so the client identifies a message by that id when it needs to scroll to one. Live broadcasts are still de-duplicated against a reloaded history by the tuple of room, author, `sentAt`, and content — the id exists on both, but the optimistic copy the sender appends has no server id yet. That tuple is what lets a live broadcast already present in a reloaded history be recognised as the same message instead of being appended twice. The client compares `sentAt` as an instant (`new Date(...).getTime()`, millisecond precision) rather than as text, because the live broadcast serializes it in UTC while a history read comes back in the server's local zone: the same moment yields two different strings, and a string key would treat the reloaded copy as a new message and append it again. `ProcessAndStoreMessage` still normalizes the stored value with `time.Now().UTC().Truncate(time.Microsecond)` so the column keeps microsecond precision, but the client's identity no longer depends on the two strings matching byte for byte.

## Replies, private replies, and message navigation

A message row carries `reply_to_id` (`BIGINT NULL REFERENCES messages(id) ON DELETE SET NULL`). The query source exposes it on the insert and joins the parent into `GetHistory`, so a history read renders every reply without an N+1 query. `models.ReplyReference` is the client-facing snapshot; the server resolves a file parent's stored `FileContent` into the same `FileAttachment` JSON a file message carries, so the quote preview parses both the same way.

On the client, right-clicking a message opens `MessageContextMenuComponent`, anchored at the pointer inside a fixed overlay. "Responder" sets `ChatRoomComponent.replyTarget`, which `MessageInputComponent` renders as a strip above the field; the strip clears on send, on cancel, and on a room change. A sent reply travels as `reply_to_id` on the socket frame or on the first entry of a batch.

The quote is rendered above the message content, with the author and a truncated preview. Clicking it calls `openReplyReference`: within the same room the virtual viewport scrolls to the message's index and flashes the row; in another room the client navigates to that room with `?message=<id>`, and the target view scrolls after its history lands. There is no pagination yet — `GET /history` returns the whole room — so "load older pages" is currently a no-op and the index is always present.

"Responder em particular" is offered only for a public-room message by someone else. It resolves the existing DM through `ConversationService.openDirectMessage` (creating it when absent) and navigates with `?replyTo=<id>`. The DM's `ChatRoomComponent` fetches that message through `GET /messages/{id}`, sets it as the composer's reply target, and clears the query parameter with `replaceUrl`. The reply is then sent and rendered by the same path as an ordinary reply, and its quote points back at the origin room, so clicking it navigates there and scrolls to the stored id.

Clicking a message author's name (or the DM header name) opens `UserInfoDialogComponent`, which shows the person's avatar, name, username, their roles as colour chips, and their presence. Its "Enviar mensagem" button reuses `ConversationService.openDirectMessage`, so it redirects to the existing DM instead of creating a duplicate. A user missing from the directory renders as "Usuário desconhecido".

## Idle detection and presence

`StatusService` keeps two layers apart: `current` is the user's chosen status (persisted under `talk_status`), and `status` is the computed value peers see. `startIdleDetection()` is called from `AppComponent`; it marks the user idle on a hidden document (`visibilitychange`), window blur, or two minutes without mouse/keyboard/wheel/touch activity, and clears idle on focus or activity. While idle the visible status becomes `away`; Do Not Disturb is a sticky override and is never replaced. The socket announcement effect watches the computed status, so an idle transition and the reconnect snapshot both reach peers.

## Administration and permissions

The admin panel lives at `/admin`, outside the chat shell, with categories for Usuários, Cargos, Salas, and Permissões. `adminGuard` loads `GET /me/permissions` before deciding, so a stored session alone does not open the panel; `adminHomeGuard` routes the bare `/admin` entry to the first category the role can open. Each child route is additionally wrapped in `adminCategoryGuard(...)`, so typing the URL of a category the role does not hold redirects to `/admin` instead of rendering a table whose mutating controls the backend would refuse. Each sidebar category is rendered only when its permission is held, and the header's admin entry follows `PermissionService.hasAdminAccess()`.

General permissions live in `role_permissions` (`admin.all`, `rooms.create`, `rooms.edit`, `rooms.view`, `users.manage`, `roles.manage`) and are checked by `permissions.Require` (or `permissions.RequireAny` where a route serves more than one key) on the admin routes. `rooms.create` also gates `POST /rooms`. `admin.all` is a wildcard: `UserHasPermission` matches it for any key, and the client's `PermissionService.can`/`canAny` does the same.

Access is **deny by default on both sides**. The `Admin` role is the only seeded role; migrations no longer grant `rooms.create`/`rooms.view` to `Developer`, and an untouched legacy seed is removed, so a role starts with nothing and an operator has to grant each key. In the client, `PermissionService` starts with an empty set and `can`/`canAny` return false until `GET /me/permissions` lands, so no action is rendered optimistically; the set is cleared on logout and on login. Creation of a public room is not offered from the chat at all: it lives in the admin panel's Salas category behind `rooms.create`, and the category itself is reachable with `rooms.view`, `rooms.edit`, or `rooms.create`.

- Per-room permissions live in `room_permissions` (`room.view`, `room.send`) for one user and `room_role_permissions` for one role. A room with **no explicit rows in either table is open** to every authenticated user, which preserves the pre-permission behavior. Once an admin grants any row, only the granted users and the members of granted roles keep access, and `admin.all` still bypasses. `ChatService.ResolveRoomAccess` checks `room.view` for public rooms, send paths additionally check `room.send`, `GetAvailableChannels` filters the room list, and `files.Service.ensureRoomAccess` applies the same rule to downloads and uploads. The room dialog in the admin panel edits one subject (user or role) at a time; the first grant is what switches the room to restricted mode, which the dialog states above the tables.
- The admin forms use the installed zard/ui controls: `z-select` for the role picker, `z-checkbox` for role membership and permission grids, `z-badge` for access-state and role chips, `z-table` for the category tables, and `z-field`/`z-field-error` for form layout and inline validation.

## Soft deletion

Users and roles carry `is_deleted` and are filtered out of every list and lookup (`users ±`, `roles`, their member joins, and the DM directory). The rows stay in the database so message history and audit references survive. A direct lookup of a removed user returns `200 null`; a removed role is also exposed as `null` through its admin lookup endpoint. On the client, a directory miss renders "Usuário desconhecido" and an unresolvable role renders "Cargo desconhecido". Removing a role member deletes only the `user_roles` membership row, so the user account, its other roles, and its history stay intact. Deleting a role leaves the membership rows in place; the live-role joins stop resolving them, which is what makes the admin table render a user with no roles.

## File storage, profile photos, and the client attachment cache

Uploaded files live under a single configurable root.

Uploaded files live under a single configurable root. `storage.New` reads `FILES_DIR` (default `files`) and creates it if missing, so a deployment can point the root at a dedicated volume. The default `chat-backend/files/` directory is gitignored because it holds runtime uploads, not source. The layout inside it is fixed:

- Room files: `files/rooms/{room_id}/{file_id}.{ext}`
- Profile photos: `files/users/{user_id}.jpg`

`internal/storage` owns the filesystem side only — it writes bytes, computes the SHA-256, and opens a file for reading; it knows nothing about rooms or the database. `internal/files` owns the business side: it checks room access, decides the on-disk extension, records the row, and builds the server-relative URL the client fetches. The URL is `/files/` + the root-relative path, so the client resolves it against whichever backend address it is pointed at. `extensionFor` keeps a known image extension (`jpeg` becomes `jpg`), keeps any other short alphanumeric extension as-is (a `.csv` stays `csv`), and falls back to the sniffed content type (`png`, `jpg`, `gif`, `txt`, `pdf`) or `bin` when the name has no usable one. The extension is never taken verbatim from the name unless it passes `isSafeExtension`, so it cannot reach outside the room's directory.

A room file is uploaded through `POST /rooms/{room_id}/files` and stored as a `files` row. A message then references it by id: `POST /messages/batch` (or a socket frame) carries `is_file` and `file_id`. The stored `content` is a JSON `FileContent` — the file id and the caption — while the client-facing `content` is a JSON `FileAttachment` with the file name, the path, the hash, and the `format`. The hash travels with the message so a download can be checked against it (the client does not recompute it yet); the format is what tells the client to preview an image or render a download card. `chatService.buildStored` resolves the file id before writing the row, so a message can never point at a missing file. There is no image-only restriction: any type within `MaxUploadBytes` (10 MiB) is accepted, which is what lets the composer's CSV/PDF attachments work.

Access control lives in `files.Service.ensureRoomAccess`: any authenticated user may read a public room's file, but a direct message's file is served only to a participant. `OpenRoomFile` also checks that the file id belongs to the room in the URL, so a participant of one room cannot read another room's file by guessing its id. Profile photos are readable by any signed-in user, since an avatar is shown to everyone.

Only images are served inline. `writeFile` sets the content type from the stored format and adds `Content-Disposition: attachment` for everything else, so a user-uploaded `.html` or `.svg` is downloaded rather than executed by the webview. Unknown formats are served as `application/octet-stream`; the map covers the common types (`csv`, `txt`, `md`, `json`, `pdf`, `zip`, Office documents, audio, and video) and images keep their inline types.

Profile photos are normalized on upload: `storage.ToAvatarJPEG` decodes any supported image, center-crops it to a square, scales it to `AvatarSize` (256px) with a Catmull-Rom filter, and re-encodes it as a JPEG at quality 82. The result is a fixed size regardless of the upload, which keeps avatars cheap to store and to transfer. This is the one place `golang.org/x/image` is used.

On the client, `ImageCacheService` keeps requested attachments — room images and downloaded files — in the webview's Cache Storage, a real on-disk directory managed by the runtime, working the same in a browser tab and inside the Tauri shell. Each entry is stamped with an `x-cached-at` header, so the user's retention choice expires it without a separate index. Attachments are fetched with the session token rather than through `HttpClient`: the backend only serves a room file to a participant, and the response is a blob the cache can hold, not a JSON body the interceptor would try to parse. `resolve` returns an object URL the template renders; `read` returns the raw blob for a save; `usage`, `clear`, and `cleanup` back the settings UI. A missing entry, an expired entry, a corrupted cached body, a Cache Storage failure (`open`/`match`/`put`), or a disabled `caches` global all fall through to a server fetch; a failed network fetch returns `null` so the caller renders its placeholder instead of an unhandled rejection. `ChatRoomComponent` resolves each image once and keeps the object URL in `resolvedImages`, keyed by path, so a re-render does not re-fetch. It watches the cache revision as well: clearing the cache or invalidating a photo drops the resolved map and resolves the images again, so the room cannot keep a revoked blob URL on screen. A non-image attachment is not fetched when the room opens — a large file nobody asked for would be downloaded automatically — so its card fetches the bytes on click and then saves them. In the desktop shell the save goes through the native dialog (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`); a browser tab falls back to an `<a download>` on an object URL. A programmatic anchor click after an async fetch is not reliable inside WebView2 — wry handles the download silently or the click is ignored — which is why the desktop path asks the user for a destination instead. Either path requests the bytes with the session token, without putting it in a URL. The dialog plugin scopes the chosen path for the fs plugin at runtime, so `capabilities/default.json` only needs `dialog:allow-save` and `fs:allow-write-file`, not a static filesystem scope.

Clicking an image in a conversation opens `ImagePreviewComponent`, a full-screen overlay that reuses the object URL already on screen rather than fetching the picture again. It is a plain fixed overlay rather than a `ZardDialogService` dialog: the dialog's padding, rounded panel and `sm:max-w-sm` cap all fight an image that should fill the viewport, and its backdrop is lighter than a preview wants. Clicking the backdrop or pressing Escape closes it; clicking the image itself does not, so a stray click while looking does not dismiss it.

The settings expose the cache under a `cache` category: a `choice` setting picks a retention of 7, 15, or 30 days (persisted under `talk_cache_ttl_days`), and a `cache`-rendered control shows a usage bar against a soft ceiling plus a clear button. The `cache` and `file` render types are the two additions to the settings registry's control union; the dialog narrows on `render`, so each is a template branch plus a registry entry. `ImageCacheService.scheduleCleanup()` runs from an app initializer but deliberately does not return its promise, so the sweep never holds up bootstrap. A `revision` signal is bumped on `invalidate`/`clear` so a view showing a cached image re-resolves it instead of keeping a stale object URL. Released object URLs are revoked after a short delay rather than immediately: an `<img>` still points at the old URL until the revision re-renders, and revoking first makes the browser log a failed blob load for a URL that is about to be replaced. `UserAvatarComponent` (`components/shared/user-avatar/`) is the single resolver for a user's avatar: it fetches `/files/users/{id}.jpg` through the cache, renders it as a plain `<img>`, and falls back to a `z-avatar` with initials. It has to bypass `z-avatar` for the photo because that component draws through `NgOptimizedImage`, which rejects blob URLs outright (`NG02952`), and every image the cache hands out is an object URL. The component watches `revision()`, so a photo uploaded in the settings replaces every copy on screen — app bar, DM list, sidebar rail, chat header, new-conversation picker, mention dialog, and the composer's `@` autocomplete — without a reload. Profile photos are only fetched when a user id is known; a user without one falls straight back to initials.

## JWT authentication

- `internal/auth/jwt.go` defines a `TokenType` (`access` / `refresh`), `AccessTokenTTL = time.Hour`, `RefreshTokenTTL = 7 * 24 * time.Hour`, a `Claims` struct embedding `jwt.RegisteredClaims` with `UserID`, `Username`, and a `token_type` field, and a `GenerateTokenPair(secret, userID, username) (accessToken, refreshToken string, err error)` function. `ParseToken(secret, rawToken) (*Claims, error)` validates a token and returns its claims. The old `GenerateToken` was removed.
- Tokens are signed with HMAC SHA-256 (HS256). Access tokens expire after 1 hour; refresh tokens after 1 week.
- The signing secret is read from the `JWT_SECRET` environment variable; if unset, a development default (`dev-secret-change-me`) is used.
- `internal/auth/middleware.go` provides `Middleware(secret)` which parses via `ParseToken`, rejects any token whose `TokenType` is not `access` (so a refresh token cannot be replayed as an access token), and stores the user ID in the request context via `UserIDFromContext`.
- A fresh database has no account and no public registration. `user.EnsureSystemUser` runs from the container after the schema/migrations and creates a bootstrap **system** user only when no live user exists (`LiveUserExists`). Credentials come from `SYSTEM_USER_USERNAME`, `SYSTEM_USER_PASSWORD`, and `SYSTEM_USER_NAME`, defaulting to `system` / `system1234` / `System`; the account is given the seeded `Admin` role (`role-admin`). The default password is logged as needing a change, never printed. `PUT /users/me/password` (current + new password, 8–72 characters) lets that account — and any other — retire the default credentials. Changing a password does not revoke existing tokens; only future logins use the new secret.
- `POST /users/login` validates credentials via the user service, then calls `auth.GenerateTokenPair` and returns `{ "accessToken": "...", "refreshToken": "...", "user": {...} }` with a 200 OK.
- `POST /users/refresh` accepts `{ "refresh_token": "..." }`, validates that it is a refresh token, checks the user still exists, and returns a new `{ "accessToken": "...", "refreshToken": "..." }` pair. The refresh token is rotated on every use. Login and refresh share a `TokenPair` struct.
- All routes except `/users/login` and `/users/refresh` are protected by the JWT middleware.
- The WebSocket `/chat` endpoint extracts the user ID from the JWT context (no `user_id` query parameter needed).
- The `Authorization` header is now included in CORS allowed headers.

## Database and sqlc rules

- PostgreSQL schema source: `chat-backend/db/schema.sql`.
- Additive changes for databases that already exist go in `chat-backend/db/migrations.sql`; every statement there must be idempotent (`ADD COLUMN IF NOT EXISTS`), because the file runs on every startup.
- Query source: `chat-backend/db/queries.sql`.
- Generated output: `chat-backend/internal/database/sqlc`.
- After changing the schema or queries, run `sqlc generate` from `chat-backend`.
- Never edit files under `internal/database/sqlc` by hand; regenerate them.
- Tables are `users`, `roles`, `user_roles`, `rooms`, `room_participants`, `messages`, `files`, `role_permissions`, `room_permissions`, and `room_role_permissions`.
- `users` exists for the login identity and profile; `roles` are admin-managed and carry a colour, and `user_roles` links a user to the roles it holds (a user may hold several). `users.role` and `users.role_id` are legacy columns that no longer drive authorization; they stay only so older rows keep their historical label. `users.email` and `users.is_deleted` support the admin table and soft deletion.
- `role_permissions` grants a general permission key to a role; `room_permissions` grants `room.view`/`room.send` to one user on one public room, and `room_role_permissions` grants the same keys to one role (its members inherit them through `user_roles`). A room with no rows in either table is open to every authenticated user.
- Migrations seed only the Admin role, with `admin.all` and the full catalog, and only while it has no permissions rows at all — so an admin edit is not silently reverted on the next startup. Developer is no longer seeded with `rooms.create`/`rooms.view`. The legacy seed is removed once, recorded in `migration_markers` (`deny-by-default-role-seed`) so a grant an operator makes afterwards survives later startups. `migration_markers` is migration infrastructure created by `migrations.sql`, not a domain table.
- `messages.is_file` marks a message whose `content` is a JSON `FileContent` (`{"file_id":"...","message":"..."}`) rather than free text. The file's own name, path, and hash live in the `files` row, so the message stays small and the metadata has a single source.
- `messages.reply_to_id` references the quoted message and is `ON DELETE SET NULL`, so deleting a parent never removes the reply.
- `files` holds one row per uploaded room file: `id`, `room_id`, `uploader`, `file_name`, `path` (root-relative), `hash` (SHA-256), `format`, and `size_bytes`.
- `ListUsers` is the only user query that omits `password`, so sqlc generates a dedicated `ListUsersRow` instead of reusing `sqlc.User`; the repository maps it explicitly.
- `ListUserDMs` joins the other participant's `users` row. A DM room name is only the two user IDs, so without that join the client cannot tell which conversation belongs to which person. `ListUserDMsRow` is mapped into `models.DMRoomResponse`, which embeds `RoomResponse` so the existing room fields stay flat in JSON.
- IDs are currently generated as `time.Now().UnixNano()` strings in services, not database-generated UUIDs.
- DMs use a canonical room name based on lexicographic ordering: `{smaller_user_id}-{larger_user_id}`.
- Database initialization is mounted into the Postgres container and runs automatically only when the database volume is initialized. Because that script runs once, the server also applies the schema itself: `database.EnsureSchema` runs `db/schema.sql` and `db/migrations.sql` (both embedded through `db/embed.go`) from the pool provider, so an existing volume gains a table or column added after it was created. This is what fixed `relation "files" does not exist` on a pre-existing development volume. Every statement is idempotent, so a repeat is a no-op; recreating the volume is no longer required for additive changes.
- `database.NewPool` reads `DATABASE_URL`, falling back to `postgres://postgres:postgres@localhost:5432/talk_chat?sslmode=disable`.
- The database is `talk_chat` and its container is `talk-chat-db`. The init script and `POSTGRES_DB` only take effect on an empty volume, so a `pgdata` volume created before the rename still holds `calling_chat` and the server will fail to connect to `talk_chat`: run `docker compose down -v` once to recreate it.

When a repository operation needs multiple related writes, consider transaction boundaries and cleanup behavior; the current room creation implementation creates a room and then inserts participants without an explicit transaction.

## Desktop client configuration

The client resolves the backend address once, in `ApiConfigService.init()`, which runs as an Angular app initializer so no request leaves before it settles. Precedence:

1. `TALKING_API_URL` in the process environment. The webview cannot read the environment the app was launched from, so `src-tauri/src/lib.rs` exposes a `get_api_url` command that reads the variable. A set variable is treated as an operator decision and locks the address — the screen renders read-only and `ApiConfigService.setApiUrl` ignores writes.
2. A client-side address the user typed on `/settings/server`, persisted in `localStorage` under `talk_api_url`.
3. `environment.apiUrl` as the compiled-in default.

`ApiConfigService.needsSetup` is true while the source is still the compiled-in default; the login screen uses it to prompt for an address instead of letting the first request fail. The route is `guestGuard`-only, because retargeting the backend mid-session would send a token issued by one server to another.

The client stores the access token under `jwt_token`, the refresh token under `jwt_refresh_token`, and the user under `jwt_user`. `AuthService.refresh()` POSTs the stored refresh token to `/users/refresh` and replaces the stored pair on success, de-duplicating concurrent refreshes through a shared in-flight observable so a burst of 401s triggers a single rotation. `authInterceptor` retries the original request once with the new access token after a 401 from a non-auth endpoint, and only clears the session and redirects to `/login` when the refresh fails; `/users/refresh` is excluded from the 401 handling so a failed refresh cannot recurse.

Addresses are normalized by `ApiConfigService.normalize`: a missing scheme becomes `http://`, a trailing slash is dropped, and only the origin is kept. `websocketBase()` derives the `ws://`/`wss://` equivalent for the chat socket.

Native window decorations are disabled (`decorations: false` in `tauri.conf.json`), so `TitleBarComponent` supplies the drag region and the minimize/maximize/close buttons. It is rendered only when `isTauri()` is true, so browser development is not left with dead window chrome. `WindowService.requestAttention()` and `WindowService.focus()` are the two window commands that are not about geometry: the first flashes the taskbar button for an incoming message, the second restores and focuses the window when the user clicks a native notification. Both are called by `NotificationService`. `requestAttention` skips a focused, visible window but always fires for a minimized one. `backgroundThrottling` is set to `disabled` in `tauri.conf.json` so the webview keeps processing socket messages while minimized — with the default policy the message could be delayed enough that the blink never appeared. `dragDropEnabled` is set to `false` for the opposite reason: Tauri otherwise installs its own drag-drop handler over WebView2's, so the composer never receives an HTML5 `dragover`/`drop` and dropping a file does nothing. Disabling it restores the webview's own handling, which is also why `main.ts` suppresses the default window-wide — without that, a file dropped outside the composer would make the webview navigate to it. The notification plugin is registered in `src-tauri/src/lib.rs` and gated by `notification:default`; `sendNative` guards on `isTauri()` so a browser tab, which has no OS notification channel, is unaffected. `WindowService` pins the auth routes (`/login`, `/settings/server`) to 480x720 and maximizes the app routes. Pinning is done with `setMinSize`/`setMaxSize` to the same value rather than `resizable: false` alone: `resizable: false` only disables dragging the edge, leaving the OS free to restore whatever geometry it had before — which is why the window came back at its maximized size after leaving the chat. The constraints must be lifted (`setMinSize(null)`) before maximizing, or the maximize call is clamped. Leaving a maximized window also needs `unmaximize` to settle before resizing, since Windows applies the restore asynchronously.

Windows open centered. `center: true` in `tauri.conf.json` covers creation, and `WindowService.applyStartup()` covers the startup handoff — a session restored straight into the chat maximizes, and the window should not sit wherever the OS placed it before that landed. `applyStartup()` only centers; it deliberately does not set the app floor, because the window is still at the 480x720 auth size at that point and raising the floor to 800x600 would grow it, only for `applyRoute` to resize it again — a visible jump on every launch. `applyAppSize()` likewise maximizes before setting the floor, so the min size cannot grow the window on the way up. `watchResize()` ignores resize events until the first route has set a mode, since there is nothing to size against during the startup handoff. The maximize button (`toggleMaximize`) re-applies the floor on every click, whether maximizing or restoring, so a restore cannot land under it. It is only ever applied while the window is restored — before maximizing, or after restoring — because tao's `set_min_inner_size` re-applies the window's current inner size through `set_inner_size`, which clears the maximized flag and `SetWindowPos`es the window to that size: calling `setMinSize` while maximized drops the window back to a full-size, non-maximized state. Restoring from maximized re-centers too, since a normal-sized window that lands on remembered geometry can be off-screen. The OS can also resize the window without going through `toggleMaximize` — `Win+Down`, dragging the title bar out of maximized, or a snap — so `WindowService.watchResize()` listens for the resize event and re-applies the constraints on every resize, not only when the maximized state flips. Acting only on a state change missed the paths where the resize lands while `isMaximized()` still reads true, or where the window is resized without that flag changing at all. Windows restores the geometry it remembered before maximizing, which can be the 480x720 auth size and therefore under the 800x600 app floor; `setMinSize` only constrains future interactive drags and never corrects the geometry the OS just applied, so `enforceMinFloor()` reads the current size and grows the window back to the floor on every resize. Re-centering stays on the restore path alone, since centering on every resize would fight the user while they drag. Every window command used needs a matching entry in `src-tauri/capabilities/default.json`; Tauri denies undeclared commands at runtime rather than failing the build.

Startup shows a splash in two layers. `index.html` carries an inline `.boot-splash` inside `<app-root>`, painted before Angular bootstraps and removed by `main.ts` once `bootstrapApplication` resolves — without it the window shows a blank frame while the address is resolved. `StartupLoadingComponent` then covers the first WebSocket handshake for a restored session, released when `WebSocketService.connected()` turns true or after a 4s timeout, so a backend that never answers cannot hold the window behind a spinner. The chat view shows a bubble-shaped `z-skeleton` while a room's history is fetched.

The chat history pins itself to the latest message with a `ResizeObserver` on the content wrapper inside the scroll viewport, not with an `effect` over the message signals. An effect cannot work here: it runs before the template has rendered, so the elements it needs do not exist yet and no later signal change re-triggers it — the history stays at the top until an unrelated interaction causes a re-render. Deferring with `afterNextRender` does not fix it either, because that still couples the scroll to Angular's render scheduling rather than to the content's actual size. The observer fires after layout, so the height it reads is final. It is attached in `ngAfterViewInit` and disconnected in `ngOnDestroy`, and guards on a `following` flag driven by the viewport's `scroll` event so reading history is not interrupted by an incoming message; sending re-attaches the viewport regardless. The jump uses `scrollTo({ top: scrollHeight })` rather than assigning `scrollTop`, since `scrollHeight` is the content height and assigning it overshoots by the viewport height. The `sm:max-w-sm` cap in the vendored `dialog.variants.ts` overrides any `zWidth`, so a wider dialog needs `zCustomClasses` alongside it — `mergeClasses` resolves the conflict without editing generated zard source.

The root layout lives in `app.component.css`, not in a `host` class. Angular rewrites `:host` to the `_nghost-*` attribute selector, giving it the same specificity as a utility class, so a `flex` host class loses on source order — and because the routed outlet relies on `flex-1`, a non-flex parent silently collapses the app to content height instead of failing visibly.

## Theming and settings

Dark mode is a `dark` class on `document.documentElement`; `styles.css` already defines a full `.dark` token set, so toggling the class repaints the app with no per-component state. `ThemeService.init()` runs as an app initializer to avoid a light-mode flash on first paint. It persists an explicit choice in `localStorage` under `talk_theme`, and only falls back to `prefers-color-scheme` — with a live listener — while nothing has been chosen.

Chat bubbles use dedicated tokens rather than the generic surface ones: the signed-in user's bubble keeps the accent `--primary`, while received bubbles use `--bubble-received`. The received bubble needs its own token because the generic `--secondary`/`--muted` surfaces sit too close to the app background to read as a distinct bubble.

The palette is derived from the app icon rather than picked independently. The gradient in `src-tauri/icons/Talk logo.png` samples as `#003578 → #004998 → #00519F → #006AB2 → #0085CD → #1A9BE3`; `--primary` is its midpoint (`oklch(0.5128 0.1394 248.4)`, white text at 5.7:1), `--mention` its deepest stop with white text in light mode and the icon's highlight (`#E5F1FC`) with the deep stop as its text in dark mode, and the five `--chart-*` are the anchor stops. The neutral surfaces carry a trace of the same hue (chroma 0.006–0.02 at 248–255) so the canvas and bubbles read as blue-grey rather than pure grey. The mention pair inverts between themes on purpose: a chip has to stay visible on the own bubble in both, and a deep chip on the blue bubble or a near-white one on the light received bubble is the only way to keep it legible on both bubble colours. The boot splash in `index.html` hardcodes the same background and muted-foreground hexes (`#ffffff`/`#69737d`, `#0a0e12`/`#9ba2ab`) because it paints before the stylesheet is parsed, so those literals must move with the tokens.

Presence and status dots also have their own tokens: `--online` (green), `--away` (amber), and the existing `--destructive` (red) for Do Not Disturb. The neutral scale has no hue to borrow for a presence dot, so each state is a token rather than a literal in every template.

Settings are a tree of categories → groups → settings declared in `settings-registry.ts`, and `SettingsDialogComponent` renders that tree generically: adding a setting is a data change, not a template change. A setting declares its `render` — `switch` for an on/off toggle, `choice` for a fixed set of values shown as a radio group — and the dialog narrows on that discriminant, so a new control type is a template branch plus a registry entry. Category icons are registered in the dialog's `provideIcons`, since an unregistered name renders nothing. The registry is built through an `Injector` because the module is evaluated at import time, outside any injection context, so `ThemeService` and `StartupService` can only be resolved when a control is read or written.

The dialog's search filters the tree rather than a flat list: a category stays visible when its own label matches *or* when any nested setting matches, and the selection jumps to the first surviving category. Searching for a term that only appears on a nested setting would otherwise hide the one category that owns it.

## Startup preferences

The "Inicialização" settings category holds one setting, "Ao iniciar", with two values: restore the last opened conversation ("Abrir a última janela") or always open the home screen ("Abrir na tela inicial"). `StartupService` owns both the choice and the last route, keyed by user id (`talk_startup_mode_<userId>` and `talk_last_route_<userId>`), because the client keeps one `localStorage` per origin and two accounts on the same machine would otherwise overwrite each other's choice.

`AppComponent` records the last route on every `NavigationEnd` while authenticated; only `/chat` URLs are kept, so the auth and server-address screens can never be restored. The stored route may be a public room (`/chat/rooms/:id`), a DM (`/chat/room/:id`), or the home list (`/chat/rooms`).

`startupGuard` applies the preference on the first navigation into the chat subtree. It cannot key off the URL: Angular resolves `redirectTo` during recognition, before guards run, so the `/chat` child redirect (`'' → 'rooms'`) means the guard already sees `/chat/rooms` rather than `/chat`. Instead `StartupService.resolveStartUrlOnce()` hands out the target exactly once and returns `null` afterwards, so the preference shapes the startup entry alone — a later in-app navigation to a room is left untouched and does not bounce back. The guard sits after `authGuard` on the `/chat` route, so an unauthenticated start still lands on `/login` (short-circuiting before the flag is consumed) and the preference is applied on the first authenticated entry, whether that is a restored session or a fresh login.

## Notifications, presence, and unread state

`NotificationService` owns everything about being told a message arrived. It watches the app-scoped socket (`WebSocketService.incoming`) rather than any one view, because a message has to be announced whether or not its room is on screen. It keeps a cursor over the buffer and processes only the entries it has not seen; the cursor resets if the buffer shrinks, so a `clearIncoming` cannot make it skip a message.

Two pieces of feedback come out of it:

- **Native notifications.** `NotificationService.announce` posts an OS notification through `@tauri-apps/plugin-notification` for every announced message, so the message is visible even while the window is minimized or in the background. The notification titles itself from the DM peer or the public room name — a public room is prefixed with `#`, matching the room list and the chat header — and carries the message text. When the message names the signed-in user, the title becomes `Você foi mencionado em <room>` instead, so the feedback names the chat the mention came from (see [Mentions](#mentions)). It is the only announcement a message gets: there is no in-app toast. The room travels in the notification's `extra` payload, and an `onAction` listener registered at construction focuses the window (`WindowService.focus()`, which unminimizes first) and routes to `/chat/room/:id` for a DM or `/chat/rooms/:id` for a public room. The listener has to exist before the notification is shown, because desktop notifications only report their actions while a listener is registered. `announce` also calls `WindowService.requestAttention()` — `requestUserAttention(UserAttentionType.Critical)`, the native yellow taskbar blink on Windows that keeps flashing until the window is focused — which skips a focused, visible window on its own. This needs `core:window:allow-request-user-attention`, `core:window:allow-is-focused`, `core:window:allow-is-minimized`, `core:window:allow-unminimize`, and `core:window:allow-set-focus` plus `notification:default` in `src-tauri/capabilities/default.json`.
- **Unread counts.** `NotificationService.unread` is a per-room count, surfaced as a badge in the public room list, the DM list, and the sidebar's conversation rail. `ChatRoomComponent` calls `setActiveRoom(roomId)` (with a cleanup that clears it), so the room on screen is read as it arrives: its messages are not counted, and opening a room clears its count. The count is the only room-scoped signal — the native notification fires for **every** room, including the one on screen, because the window may be minimized or behind another app and the "active" room says nothing about whether the user is actually looking at it.

Suppression is centralised in `NotificationService.handle`: Do Not Disturb (`StatusService.isDnd()`) and a per-room mute (`blockedRooms`) both silence the native notification and the taskbar flash together. The unread count is the one signal that always survives, which is what keeps the room list honest while notifications are off. A room is muted from the bell button in the chat header (`ChatRoomComponent.toggleNotifications`), and the mute list is persisted under `talk_blocked_rooms`.

`StatusService` holds the signed-in user's own availability — `online`, `away`, or `dnd` — persisted under `talk_status` and announced over the socket so peers see it. The header's account popover offers the three states, and the avatar carries a dot coloured from the same tokens (`bg-online`, `bg-away`, `bg-destructive`). `dnd` is the only value that changes behaviour locally; `online` and `away` differ only in the dot colour. The same dot is rendered for other users in the sidebar rail, the DM header, and the new-conversation picker, from `UserService.presence`.

Unread feedback is shown in three places: the count badge in the public room list, the DM list, and the sidebar rail. On the collapsed rail the count badge is hidden by its own variant, so the sidebar DM row also carries a small unread dot on the avatar that only appears while collapsed — otherwise collapsing the sidebar would hide the only unread signal. The badge's hover text colour is pinned back to its own (`peer-hover/menu-button:text-primary-foreground`) because the rail's menu-button variant otherwise repaints the number in the accent colour, blending it into the badge's circle.

## Mentions

A message can name people with `@`. The syntax is parsed and rendered by `shared/utils/mentions.ts`:

- `@username` — one person from the directory. The token is resolved case-insensitively through `UserService.findByUsername`; an `@word` that matches nobody stays plain text, so a stray `@` never becomes a chip.
- `@all` — every participant of the room. It is public-room only: a direct message has no audience for it, so `MentionContext.allowAll` is false there and the token falls through to a plain username lookup (and stays plain text when nobody is named `all`).
- `@role:<name>` — everyone who holds that role. `GET /roles` exposes the role roster to every signed-in user, `UserService.findRole` resolves the token case-insensitively, and the mention dialog lists the directory users who hold that role. `MentionService.mentionsMe` counts a message that names any role the signed-in user holds. A removed or renamed role no longer resolves, so the dialog and chip title say "Cargo desconhecido".

`segmentMessage(content, resolve, context)` runs `linkify` first and then splits the text runs into mention segments, so a URL that contains an `@` is never read as a mention. `ChatRoomComponent.messageRows` calls it with the directory lookup and `{ allowAll: !dm() }`, which is why the computed re-runs once `UserService.loadOnce()` lands. Mentions render as a filled chip (`bg-mention`/`text-mention-foreground`) — a dedicated token pair, because the two bubble colours are near-black and near-white in light mode and only a filled chip reads on both. A role chip reads as the role name alone (`@Admin`), so the `role:` prefix stays in the stored message but never appears in the conversation. A mention token is a single word: a role name containing whitespace cannot be represented, so the composer does not offer such a role and the token stops at the first space.

`MessageInputComponent` offers the tokens as you type. `activeMentionQuery(value, caret)` reads the `@`-token under the caret — one that starts a word and has no whitespace yet — and the composer renders a list above the field: `@all` first, then `@role:<name>` rows, then the directory filtered on username or display name (`@ma` narrows to the people whose username or name contains `ma`). `@all` is left out when the `isDm` input is set, so a DM only offers people and roles. Arrow keys move the highlight, Enter or Tab accepts, Escape dismisses, and the chosen token replaces the query with a trailing space. The list is a plain absolutely-positioned element inside a `relative` wrapper around the field, not the zard popover: it has to follow the caret and the keyboard, which an overlay anchored to a trigger cannot do. The caret is restored in an `afterNextRender` callback, because the `[value]` binding rewrites the field after the signal changes and would otherwise leave the caret at the end.

Clicking a chip opens `MentionDialogComponent` (imported on demand, since `zContent` needs the component type up front). A user mention shows that person's profile — avatar, name, username, roles, and presence; `@all` lists the directory, since a public room is open to everyone; a role mention lists everyone holding that role; a user who has left the directory carries no additional information, so the dialog deliberately renders no content.

`MentionService` answers "was I mentioned?" for feedback. It watches the same app-scoped socket buffer as `NotificationService`, with its own cursor, and counts unread mentions per room. It resolves the room type through `ConversationService` so `@all` only counts in a public room, and compares `@role:<name>` against the signed-in user's own role names. `NotificationService` calls `mentionsMe(message)` to title a mention notification `Você foi mencionado em <room>` instead of the plain room name, so the feedback names the chat the mention occurred in. The mention badge (`@`) is shown in the public room list, the DM list, and the sidebar rail; on the rail it replaces the unread count, because only one badge fits at `right-1`. Like the unread count, the mention badge survives Do Not Disturb and a muted room — the native notification is the part that is silenced. `ChatRoomComponent` calls `MentionService.setActiveRoom(roomId)` alongside `NotificationService.setActiveRoom`, so the room on screen is read as it arrives and opening a room clears its mentions.

## Development commands

From `Talk/chat-backend`:

```bash
# Start PostgreSQL
docker compose up -d

# Run the server
# FILES_DIR overrides where uploads are written (default: ./files)
go run ./cmd/server

# Format Go files
gofmt -w ./cmd ./internal

# Run all Go tests (`files/service_test.go` covers extension handling and download headers;
# `permissions/permissions_test.go` covers open/restricted per-room access)
go test ./...

# Build all packages
go build ./...

# Regenerate database code after db/schema.sql or db/queries.sql changes
sqlc generate
```

From the repository root, workspace-aware Go commands can also be used, for example `go test ./...` if the installed Go version supports the workspace layout.

From `Talk/chat-frontend`:

```bash
# Serve the Angular client in a browser (no Tauri window)
npm start

# Build the client
npm run build

# Run the desktop shell (starts the client dev server too)
npm run tauri dev

# Produce a release bundle (installer/MSI)
npm run tauri build

# Type-check the Rust side
cd src-tauri && cargo check
```

Tauri v2 has no config option for the bundle file name, so release artifacts are renamed after bundling to the project's convention, `Talk_v<version>_<arch>`. `scripts/rename-bundle.mjs` reads `productName` and `version` from `tauri.conf.json` and rewrites the names in `src-tauri/target/release/bundle`; it is wired as the `posttauri` npm script, so any `npm run tauri build` invocation applies it automatically. The script is idempotent and a no-op when no matching artifacts exist (for example after `tauri dev`).

The release produces three artifacts, named so they can coexist as distinct release assets:

- `Talk_v<version>_<arch>.exe` — the portable build, copied from the raw binary (`target/release/talk.exe`, named after the Cargo package) into `bundle/portable/`. It runs on its own but still needs the WebView2 runtime present.
- `Talk_v<version>_<arch>-setup.exe` — the NSIS installer (keeps its `-setup` suffix).
- `Talk_v<version>_<arch>_en-US.msi` — the MSI.

The portable keeps the clean name and the installer keeps `-setup` because a GitHub release cannot hold two assets with the same name.

The app icon set lives in `src-tauri/icons/` and is generated, not hand-drawn: `npx tauri icon "src-tauri/icons/Talk logo.png"` rewrites `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`, `icon.icns`, and the Windows Store `Square*Logo.png`/`StoreLogo.png` files from that single 512x512 source. Only the five entries listed in `bundle.icon` are read by the bundler, but the Store logos and `icon.png` are kept because they are what the tool regenerates as a set. Replacing the icon means replacing the source PNG and re-running the command, not editing the outputs; the `android/`, `ios/`, and `64x64.png` outputs the CLI also produces are removed because the project has no mobile target and nothing references them.

Regenerating the files is not enough on its own. `tauri-build` only declares `rerun-if-changed` for `tauri.conf.json` and `capabilities`, so an icon-only change never re-runs the build script: cargo relinks the exe against the previously compiled `resource.lib`, which still holds the old icon bytes and the previous `FileDescription`/`ProductName`, and the new icon appears to have been ignored. `build.rs` therefore prints `cargo:rerun-if-changed=icons`, which is what makes an icon-only change take effect on the next build. The NSIS setup and uninstaller take their own icon from `bundle.windows.nsis.installerIcon`/`uninstallerIcon`; without those entries the installer keeps NSIS's generic icon even when the app icon is already correct. The MSI's Add/Remove Programs icon uses the copy the bundler writes to `target/release/resources/icon.ico`, so it follows `bundle.icon` automatically.

The Tauri identifier moved with the rename (`com.luizmiguelrosa.calling` → `com.luizmiguelrosa.talk`), and `productName` is `Talk`. Windows keys both the install and the WebView2 data folder by identifier, so a build from before the rename is a different application: it installs side by side instead of upgrading, and it starts with empty `localStorage` and Cache Storage. The old `calling_*` keys and the `calling-images-v1` cache are deliberately not migrated.

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
- Backend log lines and API error/message strings are written in English and without emoji or decorative characters. Keep them factual and specific enough to diagnose the event (the affected user, room, or operation), because the server log is the only place that context appears.

## WebSocket/concurrency notes

`chat.Manager` owns the in-memory map of live WebSocket clients and routes persisted messages. The map is keyed by user ID and each entry holds a *set* of connections, so one user may hold several sockets at once; a user is online while at least one is open, and closing one window must not deregister the others.

On the client, `WebSocketService` reconnects on its own after a drop. It exposes `connected` and `everConnected` separately because `connected` alone cannot tell "the server just went away" from "the first handshake has not finished yet": the header shows **Sem conexão — reconectando...** only once `everConnected` is true, and **Conectando...** before that. A send attempted while the socket is down is not dropped — `ChatRoomComponent` parks the text in `pendingMessage` and offers a retry, and clears it on a room change so it cannot be sent to the wrong conversation.

Typing indicators ride the same socket. The client sends `{"type":"typing","room_id":"<id>","typing":true|false}` and the server relays `{"type":"typing","room_id":"<id>","author":"<userId>","typing":true|false}` to the other participant of a DM or to every other connected client in a public room. Typing frames are never stored, only relayed, and the `type` tag keeps them from being mistaken for a message broadcast (which has no `type`), so they never enter the `incoming` buffer. `MessageInputComponent` emits every keystroke through its `typing` output; `ChatRoomComponent` sends a "started" frame on the first keystroke, refreshes it every `TYPING_REFRESH_MS` while the user keeps typing, and sends "stopped" after `TYPING_IDLE_MS` of idle, on send, on a room change, and on component destroy. The receiver keeps each signal keyed by room and author and expires it after `TYPING_TIMEOUT_MS`, so a lost "stopped" frame cannot leave the indicator stuck; the label is rendered above the composer from `typingLabel`.

Presence status rides the same socket. The client sends `{"type":"status","status":"online|away|dnd"}` and the server relays `{"type":"status","author":"<userId>","status":"..."}` to **every** other connected client — availability is global, not room-scoped, so unlike a message or typing frame it is not routed through `broadcast`. The `Manager` keeps the last status per user so a client that joins later is sent a snapshot on connect instead of waiting for each peer to change; the last connection closing removes the entry and broadcasts `offline`, so peers clear the dot rather than keeping a stale colour. `StatusService` announces the stored status whenever the socket connects and on every `setStatus`; `WebSocketService` stores incoming frames in `UserService.statuses`, and `UserService.presence(userId)` turns a status into the dot's class and label (falling back to the `/users/online` list when no status has arrived).

The current upgrader accepts every origin (`CheckOrigin` returns true), and CORS allows all origins. This is acceptable only for the POC/local setup; do not treat it as production security.

## Security and known roadmap items

- Uploaded files are served under an access check: a room file is only readable by a user with access to that room (any authenticated user for a public room, a participant for a DM), and a profile photo by any signed-in user. The `files` row is the source of truth for the path, so a guessed id cannot read another room's file. Only images are served inline; every other format is sent as an attachment, so an uploaded HTML or SVG file cannot run in the webview.

- Login issues an HS256 access token valid for 1 hour and a refresh token valid for 1 week; `POST /users/refresh` rotates the pair. The signing secret defaults to a development value and should be set via `JWT_SECRET` in production.
- The bootstrap system user exists only on an empty database and starts with the default password `system1234` unless `SYSTEM_USER_PASSWORD` overrides it. Change it immediately from the account menu (“Alterar senha”); the password change endpoint never accepts a session without the current password.
- All routes except `/users/login` and `/users/refresh` are now protected by JWT middleware. The `user_id` query-parameter identity flow has been replaced with token-based authentication. There is no self-registration endpoint: accounts are created from the admin panel, and admin routes are additionally gated by `permissions.Require`.
- Token-pair hardening is explicitly out of scope for now: refresh rotation reuse detection, revocation, and secure storage are not implemented.
- A browser WebSocket handshake cannot set request headers, so `auth.Middleware` also accepts the token as a `?token=` query parameter, restricted to requests carrying an `Upgrade: websocket` header. Ordinary HTTP requests still require the `Authorization` header, because query strings reach proxy and access logs.
- The frontend keeps the session in `localStorage`, so a restart resumes the signed-in user instead of returning to login. The cost is that storage is shared by every window of an origin, so a second login in another window replaces the first window's identity.
- A stored token is treated as a claim that a session *may* exist, never as proof. `authGuard` only checks that a token and user were persisted; `authInterceptor` spends the refresh token once to recover from a `401` and replays the request, and only clears the session and redirects to `/login` when the refresh itself fails. Login and refresh are excluded from that rule because a wrong password is also a 401 and refreshing the refresh call would recurse.
- `guestGuard` keeps a signed-in user off the login screen.
- Login splits its feedback in two: field validation renders in `z-field-error` under its own input, while the server's rejection renders once below the fields, because it belongs to no single input. A `401` or `404` from login is mapped to a single **Usuário ou senha inválidos.** line before the response body is read, so the server's English sentinel text never reaches the screen and the message does not reveal which usernames exist. The line clears on the next edit to either field.
- The per-field validation flags are plain methods, not `computed`. `touched`, `dirty`, and `errors` on a form control are not signals, so a computed would cache its first value and never surface an error — which is why the minimum-length messages never appeared. The flags read `dirty || touched` so feedback shows as soon as the field is interacted with.
- The password fields carry a custom reveal toggle (`lucideEye`/`lucideEyeOff`) styled with `text-muted-foreground` so it contrasts in both themes. The native WebView2 reveal button is hidden in `styles.css` (`::-ms-reveal`) so the two do not stack.
- The server-address connection probe uses raw `fetch` rather than `HttpClient`. Any HTTP status counts as reachable — a 401 from `/users/online` still proves a server is there — but routing it through `HttpClient` would let that 401 reach `authInterceptor` and sign the user out over a connectivity check.
- Message text is linkified in the client (`shared/utils/linkify.ts`) and rendered as anchors. Clicking one does not navigate the webview: `ExternalLinkService` shows a confirmation dialog and only then opens the URL in the OS default browser, so a hostile link cannot drive the app window. Mentions (`shared/utils/mentions.ts`) are rendered as chips and never as HTML either — the content stays plain text, and a mention click opens a dialog rather than navigating.
- CORS and WebSocket origin checks are permissive.
- The client validates credentials against the backend's own constraints rather than duplicating them as its own source of truth; the constants in `shared/utils/validation.ts` (username 3–32, name 2–64, email shape/254, password 8–72) mirror the Go DTO tags and must be changed together with them. The admin user form and the change-password dialog evaluate those rules on input/blur and again on submit, so an invalid email or password is rejected before any request is sent.
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
