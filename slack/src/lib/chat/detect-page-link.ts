/**
 * detect-page-link.ts
 * Detects /pages/:uuid links in a message string.
 * Handles absolute (same-origin or any origin) and relative forms.
 */

// UUID v4 pattern: 8-4-4-4-12 hex chars
const UUID_RE = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

// Matches:
//   /pages/<uuid>
//   /pages/<uuid>/
//   http(s)://any-host/pages/<uuid>
//   http(s)://any-host/pages/<uuid>/?query
// Capture group 1 = pageId
const PAGE_LINK_RE = new RegExp(
  `(?:https?://[^\\s/]+)?/pages/(${UUID_RE})(?:[/?][^\\s]*)?`,
  'gi'
);

export interface PageLinkMatch {
  match: string;
  pageId: string;
}

/**
 * Find all unique /pages/:id links in `content`.
 * When `origin` is provided, absolute URLs with a different origin are still
 * accepted (the card only renders for workspace-local pages, but we let the
 * caller decide). Relative links are always accepted.
 *
 * Returns up to 3 unique pageId matches to avoid spam.
 */
export function detectPageLinks(
  content: string,
  _origin?: string
): PageLinkMatch[] {
  const seen = new Set<string>();
  const results: PageLinkMatch[] = [];

  // Reset lastIndex before exec loop
  PAGE_LINK_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = PAGE_LINK_RE.exec(content)) !== null) {
    const pageId = m[1].toLowerCase();
    if (!seen.has(pageId)) {
      seen.add(pageId);
      results.push({ match: m[0], pageId });
    }
    if (results.length >= 3) break;
  }

  return results;
}

/**
 * Convenience: return the first match or null (for single-card use-cases).
 */
export function detectPageLink(
  content: string,
  origin?: string
): PageLinkMatch | null {
  const all = detectPageLinks(content, origin);
  return all.length > 0 ? all[0] : null;
}
