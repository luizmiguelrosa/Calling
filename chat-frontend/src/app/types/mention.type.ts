/**
 * The kinds of mention a message can carry.
 *
 * - `user`  — `@username`, one person from the directory.
 * - `group` — `@group:<name>`, a named set of people. Not implemented yet: the
 *             token is parsed and rendered so the syntax is stable, but nothing
 *             resolves its members (see `shared/utils/mentions.ts`).
 * - `all`   — `@all`, every participant of the room.
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
