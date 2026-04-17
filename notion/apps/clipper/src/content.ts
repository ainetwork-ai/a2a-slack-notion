/**
 * Content script — runs in the page's world. Responsible ONLY for
 * extracting content; it never talks to the API directly (CORS +
 * keeping secrets out of the page origin).
 *
 * Invoked via `chrome.scripting.executeScript` from the background
 * service worker; the return value is bubbled back as the extracted
 * page payload.
 */

import type { ExtractedPage } from './types';

const SKIP_TAGS = new Set([
  'NAV',
  'FOOTER',
  'ASIDE',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'FORM',
  'HEADER',
  'BUTTON',
]);

function textFrom(node: Element): string {
  // Walk text nodes, skipping SKIP_TAGS descendants. Collapse whitespace.
  const parts: string[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
    acceptNode(el) {
      if (SKIP_TAGS.has((el as Element).tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const paragraphTags = new Set([
    'P',
    'LI',
    'BLOCKQUOTE',
    'PRE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ]);
  let el = walker.currentNode as Element | null;
  while (el) {
    if (el && paragraphTags.has(el.tagName)) {
      const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (txt) parts.push(txt);
    }
    el = walker.nextNode() as Element | null;
  }
  return parts.join('\n');
}

function pickMainContainer(): Element {
  // Prefer semantic containers; fall back to the biggest text block.
  const candidates: Element[] = [];
  const article = document.querySelector('article');
  if (article) candidates.push(article);
  const main = document.querySelector('main');
  if (main) candidates.push(main);
  document.querySelectorAll('[role="main"]').forEach((el) => candidates.push(el));

  if (candidates.length > 0) {
    // Pick the candidate with the most text.
    return candidates.sort(
      (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
    )[0]!;
  }

  return document.body;
}

function meta(selector: string, attr = 'content'): string | undefined {
  const el = document.head.querySelector(selector) as HTMLMetaElement | null;
  const v = el?.getAttribute(attr)?.trim();
  return v && v.length > 0 ? v : undefined;
}

function favicon(): string | undefined {
  const link = document.head.querySelector(
    'link[rel~="icon"]',
  ) as HTMLLinkElement | null;
  if (!link?.href) return undefined;
  try {
    return new URL(link.href, location.href).toString();
  } catch {
    return undefined;
  }
}

export function extract(): ExtractedPage {
  const selection = window.getSelection()?.toString() ?? '';
  const container = pickMainContainer();
  const flattened = textFrom(container);
  const paragraphs = flattened
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return {
    title: document.title,
    url: location.href,
    selection,
    paragraphs,
    image:
      meta('meta[property="og:image"]') ??
      meta('meta[name="twitter:image"]'),
    description:
      meta('meta[property="og:description"]') ??
      meta('meta[name="description"]'),
    icon: favicon(),
  };
}

// When injected via chrome.scripting.executeScript({ func: extract }),
// bundlers sometimes tree-shake the call. Expose on window so
// executeScript({ files: ['content.js'] }) also works — the last
// expression is returned to the background script.
(globalThis as unknown as { __clipperExtract?: () => ExtractedPage }).__clipperExtract = extract;
extract();
