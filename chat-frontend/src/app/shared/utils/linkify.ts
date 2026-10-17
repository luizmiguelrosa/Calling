/** A run of message text: either plain text or a detected URL. */
export type MessageSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

/**
 * Matches `http(s)://` URLs. Only explicit schemes are detected: a bare `www.`
 * or a domain-looking word would turn ordinary prose into links.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/**
 * Punctuation that is almost never part of a URL but is common right after one
 * ("veja https://example.com."). It is trimmed from the match and left in the
 * surrounding text.
 */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Splits message content into text and link segments so the view can render
 * URLs as anchors without ever injecting HTML — the content stays plain text.
 */
export function linkify(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const trailing = match[0].match(TRAILING_PUNCTUATION)?.[0] ?? '';
    const url = trailing ? match[0].slice(0, -trailing.length) : match[0];

    if (!url) {
      continue;
    }

    if (start > cursor) {
      segments.push({ type: 'text', value: content.slice(cursor, start) });
    }

    segments.push({ type: 'link', value: url, href: url });
    cursor = start + url.length;
  }

  if (cursor < content.length) {
    segments.push({ type: 'text', value: content.slice(cursor) });
  }

  return segments;
}
