# Calling v1.0.3

## Updates

### v1.0.3

#### Message ordering
- Fixed messages duplicating and reordering when returning to a conversation. A live broadcast already present in a reloaded history is now recognised as the same message instead of being appended a second time, so the original sending order is preserved.
- Messages are matched by the instant they were sent rather than by the raw timestamp text. A broadcast and a history read can format the same moment differently, and the previous text comparison treated the reloaded copy as a new message — which is what duplicated it and scrambled the order.
- Room history is now ordered deterministically by timestamp and insertion id, so messages sent within the same instant keep their insertion order.

#### Loading states
- Added a startup splash while the app connects to the server. It covers the backend address resolution during bootstrap and the first WebSocket handshake, so the window no longer shows a blank frame at launch.
- The chat view now shows a bubble-shaped skeleton while a conversation's history is being fetched, in a colour that stands off the content card.

#### Message contrast
- Received message bubbles use a dedicated surface token that contrasts with the muted content card in both light and dark themes, instead of blending into it.

#### Login feedback
- An invalid username or password now shows a clear message below the form. The message clears as soon as the fields are edited.

#### External links
- URLs in messages are rendered as clickable links. Clicking one opens a confirmation dialog, and confirming opens the address in the user's default browser.

#### Room titles
- A newly created public room now shows its name in the chat header right away. The room list that backs the title is refetched on every room change, so a room created after the view was opened no longer falls back to “Conversa”.

#### Home navigation
- The sidebar's “Início” entry now returns to the last public room visited instead of the bare room list. The last room is remembered across restarts.

#### Window
- Fixed the maximize button leaving the window stuck at full size. The minimum window size is now applied only while the window is restored, so maximizing and restoring behave correctly again.

#### Room list
- The public room list is slightly narrower on medium and larger windows.
