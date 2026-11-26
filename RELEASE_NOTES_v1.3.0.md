# Talk v1.3.0

## Changes since v1.2.0

### Rebrand: Calling → Talk
- The product is now **Talk** everywhere: window title, login screen, app bar, startup splash, docs, and release artifacts (`Talk_v<version>_<arch>`).
- Tauri identifier changed from `com.luizmiguelrosa.calling` to `com.luizmiguelrosa.talk`; the Cargo package is `talk`, the Angular project is `talk`, and the bundle output is `dist/talk/browser`.
- Database renamed `calling_chat` → `talk_chat`; the container is now `talk-chat-db`.
- Environment variable `CALLING_API_URL` → `TALKING_API_URL`.
- Client storage keys `calling_*` → `talk_*` (theme, status, cache TTL, blocked rooms, startup preference, last route, last room, API URL).
- New icon set generated from `Talk logo.png`; NSIS installer/uninstaller icons are configured, and `build.rs` declares `rerun-if-changed=icons` so an icon-only change is re-embedded.
- Theme palette re-derived from the icon gradient: blue accent, tinted neutrals, a dedicated mention pair, and a five-stop chart ramp.

### Permission model overhaul
- **Groups** are the permission-bearing entity. A user may belong to several groups; each group has a name, a colour, members, general permissions, and per-room grants.
- **Roles** are display-only labels. A user has exactly one role, shown as a coloured chip; roles grant nothing.
- **Deny by default**: a group starts with no permissions. The seeded **Admin** group holds the full catalog, and `admin.all` is a wildcard that satisfies every check.
- General permission keys: `admin.all`, `rooms.create`, `rooms.edit`, `rooms.view`, `users.manage`, `roles.manage`, `groups.manage`.
- Per-room keys: `room.view` and `room.send`. A room with no explicit rows is **open** to every authenticated user; the first grant switches it to **restricted**, and only granted users/groups (plus `admin.all`) keep access.
- Room grants can target one user (`room_permissions`) or one group (`room_group_permissions`); group grants apply to every member through `group_members`.
- **Mentions** use `@group:<name>` to notify everyone in a group. The composer autocomplete lists groups with their colours; `@all` remains public-room only.
- **Soft deletion**: users, groups, and roles carry `is_deleted` and disappear from every list and lookup. Removing a group member drops only the membership row. Removed users, groups, and roles render as "Usuário desconhecido", "Grupo desconhecido", and "Cargo desconhecido".

### Accounts and authentication
- **Self-registration removed**: `POST /users` is gone; accounts are created from the admin panel.
- **Bootstrap system user**: on a database with no live user, the server creates a `system` account so the first real users can be created. Override the defaults with `SYSTEM_USER_USERNAME`, `SYSTEM_USER_PASSWORD`, and `SYSTEM_USER_NAME`.
- **Password change**: `PUT /users/me/password` verifies the current password and replaces it (8–72 characters). The account menu exposes it as **Alterar senha**.
- `GET /me/permissions` returns the signed-in user's granted general permissions.
- `GET /roles` and `GET /groups` expose id/name/colour pairs to any signed-in user for selectors and mention resolution.
- `GET /users` returns `null` for a soft-deleted user instead of `404`.

### Replies and message navigation
- `messages.reply_to_id` stores the quoted message; `GET /history` joins the parent so a reply renders its quote without an N+1 query.
- Right-clicking a message opens a context menu with **Responder** and, for another author's public-room message, **Responder em particular**.
- The composer shows a reply strip; the sent message renders the quote above its content.
- Clicking a quote jumps to the original message and flashes it. A quote from another room navigates there with `?message=<id>`.
- **Responder em particular** resolves or creates the author's DM and navigates with `?replyTo=<id>`; the DM fetches the message through `GET /messages/{id}` and pre-fills the composer.
- Every broadcast and history row now carries the stored `id`, and `reply_to` is delivered as a snapshot (`id`, `room_id`, `author`, `content`, `is_file`).

### Presence and idle detection
- Losing focus, hiding the document, or two minutes without mouse/keyboard/wheel/touch activity flips the visible status to **Ausente**; activity restores the chosen status.
- **Não perturbe** is a sticky override and is never replaced by the idle detector.
- The idle detector is app-wide and starts from `AppComponent`.

### Admin panel
- `/admin` is a separate shell with categories for **Usuários**, **Cargos**, **Grupos**, **Salas**, and **Permissões**.
- `adminGuard` loads `GET /me/permissions` before deciding; `adminHomeGuard` routes the bare `/admin` entry to the first reachable category; `adminCategoryGuard` blocks a category the user cannot use.
- Categories are rendered only when their permission is held; the header's **Administração** entry follows `PermissionService.hasAdminAccess()`.
- **Usuários**: table with name, e-mail, role chip, and group chips; create/edit dialog with a single role select and group checkboxes; soft delete behind a confirmation.
- **Cargos**: display-role table and create/edit dialog (name, colour, members); soft delete.
- **Grupos**: group table and create/edit dialog (name, colour, members); remove member; soft delete.
- **Salas**: public-room table; **Nova sala** behind `rooms.create`; edit dialog renames the room and toggles `room.view`/`room.send` per user or group, with an **Acesso aberto**/**Acesso restrito** badge.
- **Permissões**: the general permission catalog served by `GET /admin/permissions`.
- New zard/ui components: `badge`, `checkbox`, `select`, and `table`.

### Admin API
- `GET/POST /admin/users`, `PUT/DELETE /admin/users/{id}` — list, create, edit, and soft-delete users (`users.manage`).
- `GET/POST /admin/groups`, `GET/PUT/DELETE /admin/groups/{id}` — list, create, edit, and soft-delete groups (`groups.manage`).
- `DELETE /admin/groups/{id}/members/{userId}` — remove a group member (`groups.manage`).
- `PUT /admin/groups/{id}/permissions` — replace a group's general permissions (`groups.manage`).
- `GET/POST /admin/roles`, `GET/PUT/DELETE /admin/roles/{id}` — list, create, edit, and soft-delete display roles (`roles.manage`).
- `GET /admin/rooms` — list public rooms; reachable with `rooms.view`, `rooms.edit`, or `rooms.create`.
- `GET /admin/rooms/{id}/permissions` — a room's explicit grants (`rooms.view` or `rooms.edit`).
- `PUT /admin/rooms/{id}` and `PUT /admin/rooms/{id}/permissions` — rename a room and replace one user's or group's grants (`rooms.edit`).
- `GET /admin/permissions` — the general permission catalog (`roles.manage`).
- Removed group and role lookups return `200 null`.

### Database and migration
- New tables: `groups`, `group_members`, `group_permissions`, `room_permissions`, `room_group_permissions`, and `migration_markers`.
- `roles` is redefined as a display-only table (`id`, `name`, `color`, `is_deleted`, `created_at`).
- `users` gains `email`, `role_id`, and `is_deleted`; `role` becomes a legacy default-`''` label.
- `messages` gains `reply_to_id` (`BIGINT NULL REFERENCES messages(id) ON DELETE SET NULL`).
- Migration `groups-restored` (recorded in `migration_markers`) copies old roles into groups, `user_roles` into `group_members`, `role_permissions` into `group_permissions`, and `room_role_permissions` into `room_group_permissions`, then clears `roles` and drops the old tables.
- The **Admin** group is seeded with the full catalog only while it has no permission rows, so an admin edit survives later startups.
- New indexes: `idx_group_members_user_id`, `idx_room_permissions_user_id`, and `idx_room_group_permissions_group_id`.

### Backend
- New `internal/admin` module (handler, service, repository, DTOs) and `internal/permissions` module (catalog, service, repository, `Require`/`RequireAny` middleware).
- `chat.Service` checks `room.view` for history/list and `room.send` for sends; `files.Service` checks `room.view` for downloads and `room.send` for uploads.
- `POST /rooms` requires `rooms.create`; `GET /rooms` filters out restricted rooms the user cannot view.
- `GET /history` returns `403` for a restricted room without `room.view`.
- `POST /messages/batch` and socket frames accept `reply_to_id`; the parent is checked for existence, which allows a cross-room quote.
- Server logs and API error strings are now English and emoji-free.
- CORS allows `PUT` and `DELETE`.
- Tests: `permissions/middleware_test.go` and `permissions/permissions_test.go` cover the middleware and open/restricted room access.

### Frontend
- New `admin` components, `admin.guard.ts`, `admin.service.ts`, `permission.service.ts`, the `user-info` dialog, the `change-password` dialog, and the `message-context-menu` component.
- `PermissionService` caches `GET /me/permissions`, treats `admin.all` as a wildcard, and resets on login/logout.
- The chat room uses a CDK virtual scroll viewport; replies, quotes, and message navigation scroll by index.
- The composer shows the reply strip, group mention autocomplete, and a compact attachment row.
- The mention dialog lists group members for `@group:` mentions and says "Grupo desconhecido" for a removed group.
- The user info dialog shows avatar, name, username, groups, role, presence, and **Enviar mensagem** (reuses the existing DM).
- The change-password dialog validates the current/new/confirmation fields and reports a wrong current password as "Senha atual incorreta."
- Shared validation constants (`username` 3–32, `name` 2–64, `email` shape/254, `password` 8–72) mirror the Go DTO tags.
- The login screen no longer links to registration.

### Upgrade notes
- **Database rename**: an existing `pgdata` volume still holds `calling_chat`. Run `docker compose down -v` once (this drops the data) or point `DATABASE_URL` at the old database.
- **Migration**: `groups-restored` runs once on startup. Back up the database first. It moves old roles into groups and drops `user_roles`, `role_permissions`, and `room_role_permissions`.
- **Display roles**: the migration clears `roles`, so existing users' `role_id` becomes `NULL` and they render as "Sem cargo" until a display role is created and assigned. Their group memberships (and therefore permissions) are preserved.
- **Desktop install**: the Tauri identifier changed, so a build from before the rename installs side by side and starts with empty `localStorage` and Cache Storage. The old `calling_*` keys and `calling-images-v1` cache are not migrated.
- **Bootstrap user**: change the default password immediately from the account menu.
