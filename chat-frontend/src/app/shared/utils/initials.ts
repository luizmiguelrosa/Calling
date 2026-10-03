/**
 * Initials for an avatar fallback: the first letter of the first two words, or
 * of the first two segments of a dotted/underscored handle.
 */
export function initials(source: string | null | undefined): string {
  const letters = (source ?? '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]);

  return letters.join('').toUpperCase() || '?';
}