# Calling v1.2.0

## Updates

### v1.2.0

#### Authentication
- Login now issues a short-lived access token (1 hour) together with a refresh token (1 week). `POST /users/refresh` exchanges the refresh token for a new pair, and the refresh token is rotated on every use.
- An expired access token is refreshed automatically: the client retries the failed request once with the new token and only returns to login when the refresh itself fails. Concurrent `401`s share a single refresh, so a burst of requests cannot spend the same refresh token twice.
- The backend rejects a refresh token presented as an access token, so the longer lifetime cannot be replayed against protected routes.

#### Presence and typing
- The account menu offers **Online**, **Ausente**, and **Não perturbe**. The choice is announced over the socket and shown as a coloured dot on the avatar in the account menu, the DM header, the sidebar rail, and the new-conversation picker.
- A client that connects receives a snapshot of everyone's current availability instead of waiting for the next change, and a disconnect clears the dot when a user's last window closes.
- Typing indicators now appear above the composer. A "still typing" signal is refreshed while the user types and expires on its own if the "stopped" frame is lost.

#### Notifications and unread state
- Every incoming message produces a native OS notification, titled with the DM peer or the public room name (prefixed with `#`). Clicking it focuses the window and opens the conversation it came from.
- The taskbar button flashes natively while the window is minimised or in the background, and the webview is kept processing while minimised so a message is not delayed.
- Unread counts appear as a badge in the public room list, the DM list, and the sidebar rail. On the collapsed rail a small dot on the avatar keeps the signal visible.
- The bell in the chat header mutes a single room. Do Not Disturb and a muted room silence the native notification and the taskbar flash together, while unread counts keep updating.

#### Mentions
- Messages can name people with `@username` and, in public rooms, everyone with `@all`.
- Typing `@` in the composer opens an autocomplete above the field with keyboard navigation; it filters on username and display name and omits `@all` in direct messages.
- Mentions render as chips. Clicking one opens the mentioned person's profile, or the user directory for `@all`.
- A mention titles its notification **Você foi mencionado em &lt;room&gt;** and adds an `@` badge to the room list, the DM list, and the rail in place of the plain unread count.

#### Files and attachments
- The composer accepts any file type up to 10 MiB, through the paperclip button, by pasting, or by dragging it onto the composer. Several files can be staged at once, each removable before sending.
- Images are previewed inline in the conversation; every other format is rendered as a download card with its name and format. Clicking a card fetches the bytes on demand and, in the desktop app, asks for a destination with the native save dialog. A browser tab falls back to a normal download.
- Uploads are stored under `FILES_DIR` (default `files`) as `files/rooms/{room_id}/{file_id}.{ext}`, with the row in the database as the source of truth for the name, path, SHA-256 hash, and format.
- A room file is served only to a user with access to the room. Non-image formats are sent as attachments rather than inline content, so an uploaded HTML or SVG file cannot run in the webview.
- `POST /messages/batch` stores several messages for one room in a single request, each optionally referencing an uploaded file.

#### Profile photos
- A profile photo can be uploaded from the settings. It is centre-cropped to a square, resized to 256×256, and compressed as a JPEG before being stored.
- The photo is shown wherever a user appears — account menu, DM list, sidebar rail, chat header, new-conversation picker, mention dialog, and the composer's `@` autocomplete — with initials as the fallback.
- Uploading a new photo replaces every copy on screen immediately, without a reload.

#### Image cache
- Downloaded images and attachments are cached on disk in the webview's Cache Storage, with a retention choice of 7, 15, or 30 days.
- The settings show the cache's current usage against a soft ceiling, offer a manual clear, and sweep expired entries in the background at startup.
- Clearing the cache or replacing a profile photo re-resolves every visible image instead of leaving a stale copy on screen.

#### Image preview
- Clicking an image in a conversation opens it full-screen over a dark backdrop. Clicking the backdrop or pressing Escape closes it; clicking the image itself does not.

#### Settings and startup
- The settings tree gained **Inicialização**, **Perfil**, and **Cache** categories, with new `choice`, `file`, and `cache` controls alongside the existing switch.
- **Ao iniciar** chooses between restoring the last opened conversation and always opening the home screen. The preference and the last route are stored per user, so two accounts on the same machine do not overwrite each other.

#### Database and startup
- The new `files` table stores one row per uploaded room file, and `messages.is_file` marks a message whose content references one.
- The server now applies `db/schema.sql` and the new `db/migrations.sql` itself on every startup, so an existing database volume gains new tables and columns without being recreated.
- Added unit tests for the file service's extension handling and download headers.

#### Desktop shell
- Added the notification, dialog, and filesystem plugins, with the window permissions needed to flash the taskbar, focus the window, and save an attachment.
- Disabled background throttling so socket messages keep arriving while the window is minimised, and disabled Tauri's own drag-drop handler so the composer receives dropped files.
