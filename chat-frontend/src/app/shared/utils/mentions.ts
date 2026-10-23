import { linkify, type MessageSegment as LinkSegment } from './linkify';

/** A mention token found in the text, with the offsets of the whole `@token`. */
export interface MentionToken {
  token: string;
  start: number;
  end: number;
}

/** The mention being typed at the caret, if any. */
export interface MentionQuery {
  /** The text typed after `@`, without the sigil. */
  query: string;
  /** Index of the `@`. */
  start: number;
  /** Caret index; the query runs from `start + 1` to here. */
  end: number;
}

/** A run of message content: plain text, a detected URL, or a mention. */
export type MessageSegment =
  | LinkSegment
  | { type: 'mention'; value: string; mention: Mention };

/** Turns a username into the directory entry it names, if any. */
export type MentionResolver = (username: string) => UserResponse | undefined;

/**
 * What the room allows. `@all` names every participant of a public room, but a
 * direct message has no such audience, so it is not a mention there.
 */
export interface MentionContext {
  allowAll?: boolean;
}

/** `@all` — every participant of the room. */
const ALL_TOKEN = 'all';
/** `@group:<name>` — a named set of users (not implemented yet). */
const GROUP_PREFIX = 'group:';

/**
 * A mention is an `@` that starts a word: the lookbehind keeps `user@host` from
 * being read as a mention of `host`. The token runs to the first character that
 * cannot be part of a username or a `group:` prefix.
 */
const MENTION_PATTERN = /(?<![\w@])@([A-Za-z0-9._:-]+)/g;

/** Every mention token in the content, in order, with its offsets. */
export function findMentionTokens(content: string): MentionToken[] {
  const tokens: MentionToken[] = [];

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    tokens.push({ token: match[1], start, end: start + match[0].length });
  }

  return tokens;
}

/**
 * The mention the caret is currently inside, or null. A mention stays open while
 * the caret sits in an `@`-token that starts a word and has no whitespace yet, so
 * typing `@ma` keeps it open and a space closes it. This is what drives the
 * composer's autocomplete.
 */
export function activeMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start === -1) {
    return null;
  }

  // The `@` must start a word, so `user@host` is not a mention.
  if (start > 0 && /[\w@]/.test(value[start - 1])) {
    return null;
  }

  // The token stops at the first character that cannot be part of a username or
  // a `group:` prefix — a space, most of all.
  const query = before.slice(start + 1);
  if (!/^[A-Za-z0-9._:-]*$/.test(query)) {
    return null;
  }

  return { query, start, end: caret };
}

/**
 * Reads a raw token into a mention. `@all` and `@group:` are reserved; anything
 * else is a username candidate, resolved through the directory when one is
 * supplied. When `allowAll` is false the `all` token is not reserved, so it
 * falls through to the directory like any other username.
 */
export function classifyMention(
  token: string,
  resolve?: MentionResolver,
  context?: MentionContext,
): Mention {
  const lower = token.toLowerCase();

  if (lower === ALL_TOKEN && context?.allowAll !== false) {
    return { kind: 'all', token, userId: null, group: null };
  }

  if (lower.startsWith(GROUP_PREFIX)) {
    return { kind: 'group', token, userId: null, group: token.slice(GROUP_PREFIX.length) };
  }

  const user = resolve?.(token);
  return { kind: 'user', token, userId: user?.id ?? null, group: null };
}

/**
 * Splits message content into text, link, and mention segments. Links are
 * detected first, so a URL that happens to contain an `@` is never read as a
 * mention.
 */
export function segmentMessage(
  content: string,
  resolve: MentionResolver,
  context?: MentionContext,
): MessageSegment[] {
  const segments: MessageSegment[] = [];

  for (const segment of linkify(content)) {
    if (segment.type !== 'text') {
      segments.push(segment);
      continue;
    }

    segments.push(...splitMentions(segment.value, resolve, context));
  }

  return segments;
}

/**
 * Whether a message names the given username. `@all` counts for everyone in a
 * room that allows it; `@group:` does not, because groups are not implemented
 * yet — once they are, membership has to be resolved here.
 */
export function mentionsUser(content: string, username: string, context?: MentionContext): boolean {
  const target = username.toLowerCase();

  for (const { token } of findMentionTokens(content)) {
    const lower = token.toLowerCase();
    if (lower === target) {
      return true;
    }
    if (lower === ALL_TOKEN && context?.allowAll !== false) {
      return true;
    }
  }

  return false;
}

function splitMentions(text: string, resolve: MentionResolver, context?: MentionContext): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  for (const { token, start, end } of findMentionTokens(text)) {
    const mention = classifyMention(token, resolve, context);

    // An `@word` that matches nobody is ordinary text, not a mention: rendering
    // it as one would turn every stray `@` into a chip. The skipped token stays
    // in the surrounding text because `cursor` is left untouched.
    if (mention.kind === 'user' && mention.userId === null) {
      continue;
    }

    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }

    segments.push({ type: 'mention', value: text.slice(start, end), mention });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  return segments;
}
