/**
 * Minimal HTTP client for the slack-a2a Notion API used by the
 * clipper. Called from the background service worker — DO NOT
 * call directly from content scripts (they run in the page
 * origin and will trip CORS).
 */

import type {
  ClipperSettings,
  CreateBlockBody,
  CreatePageBody,
  ExtractedPage,
} from './types';

const MAX_TITLE_LEN = 200;
const MAX_BLOCKS_PER_CLIP = 50;

function authHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function httpJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string') detail = body.error;
    } catch {
      // response wasn't JSON — keep the status text
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** POST /api/pages — creates a root page block. */
export async function createPage(
  settings: ClipperSettings,
  body: CreatePageBody,
): Promise<{ id: string }> {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/api/pages`;
  return httpJson<{ id: string }>(url, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(settings.apiKey),
    body: JSON.stringify(body),
  });
}

/** POST /api/pages/:id/blocks — appends a single block to a page. */
export async function appendBlock(
  settings: ClipperSettings,
  pageId: string,
  block: CreateBlockBody,
): Promise<void> {
  const url = `${settings.baseUrl.replace(/\/$/, '')}/api/pages/${encodeURIComponent(
    pageId,
  )}/blocks`;
  await httpJson<unknown>(url, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(settings.apiKey),
    body: JSON.stringify(block),
  });
}

/**
 * Full clip flow: create a page then append content blocks.
 * Returns the created page id plus a best-effort URL to view it.
 */
export async function clip(
  settings: ClipperSettings,
  page: ExtractedPage,
): Promise<{ pageId: string; pageUrl: string }> {
  if (!settings.workspaceId) {
    throw new Error('workspaceId is required — set it in Options.');
  }

  const title =
    (page.title || page.url || 'Clipped page').slice(0, MAX_TITLE_LEN) ||
    'Clipped page';

  const created = await createPage(settings, {
    workspaceId: settings.workspaceId,
    title,
    icon: page.icon,
    properties: {
      source: page.url,
      description: page.description,
      topic: 'clipped',
    },
  });

  // Build the block list: optional selection, then extracted paragraphs.
  const blocks: CreateBlockBody[] = [];
  if (page.selection.trim()) {
    blocks.push({ type: 'text', content: { text: page.selection.trim() } });
  }
  for (const para of page.paragraphs.slice(0, MAX_BLOCKS_PER_CLIP)) {
    const trimmed = para.trim();
    if (trimmed) {
      blocks.push({ type: 'text', content: { text: trimmed } });
    }
  }

  // Append sequentially — keeps insertion order deterministic and lets
  // us surface the first failing block to the user.
  for (const block of blocks) {
    await appendBlock(settings, created.id, block);
  }

  const pageUrl = `${settings.baseUrl.replace(/\/$/, '')}/pages/${created.id}`;
  return { pageId: created.id, pageUrl };
}
