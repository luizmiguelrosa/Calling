/**
 * The kinds of mention a message can carry.
 *
 * - `user` — `@username`, one person from the directory.
 * - `group` — `@group:<name>`, everyone who belongs to that group.
 * - `all`  — `@all`, every participant of the room.
 */
type MentionKind = 'user' | 'group' | 'all';

/** A mention parsed out of a message. */
interface Mention {
  kind: MentionKind;
  /** The text typed after the `@`, without the sigil. */
  token: string;
  /** The resolved user id for a `user` mention; null when nobody matches. */
  userId: string | null;
  /** The group name for a `group` mention; null otherwise. */
  group: string | null;
}