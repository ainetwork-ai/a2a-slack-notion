'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface PageHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

/** Safely extract plain text from block content or properties. */
function extractText(block: Record<string, unknown>): string {
  // content.text is a plain string (common in this codebase)
  const content = block.content as Record<string, unknown> | undefined;
  if (content) {
    if (typeof content.text === 'string' && content.text) return content.text;
    // Rich-text array shape: [{ text: { content: string } }]
    if (Array.isArray(content.text)) {
      return (content.text as Array<{ text?: { content?: string }; plain_text?: string }>)
        .map((t) => t.plain_text ?? t.text?.content ?? '')
        .join('');
    }
  }
  // Fallback: properties.title (Notion-style)
  const props = block.properties as Record<string, unknown> | undefined;
  if (props) {
    if (typeof props.title === 'string') return props.title;
    if (Array.isArray(props.title)) {
      return (props.title as Array<[string, ...unknown[]]>)
        .map(([text]) => (typeof text === 'string' ? text : ''))
        .join('');
    }
  }
  return '';
}

const HEADING_TYPES = new Set(['heading_1', 'heading_2', 'heading_3']);

function levelOf(type: string): 1 | 2 | 3 {
  if (type === 'heading_1') return 1;
  if (type === 'heading_2') return 2;
  return 3;
}

interface PageBlocksResponse {
  page: Record<string, unknown>;
  blocks: Array<Record<string, unknown>>;
}

/**
 * SWR hook — fetches page blocks and returns heading blocks in document order.
 *
 * TODO: Replace refreshInterval with a Yjs doc-change subscription once the
 * collaborative editor exposes a stable change event.
 */
export function usePageHeadings(pageId: string): {
  headings: PageHeading[];
  isLoading: boolean;
} {
  const { data, isLoading } = useSWR<PageBlocksResponse>(
    pageId ? `/api/pages/${pageId}` : null,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: false }
  );

  if (!data?.page || !data?.blocks) {
    return { headings: [], isLoading };
  }

  const page = data.page as Record<string, unknown>;
  const allBlocks = data.blocks as Array<Record<string, unknown>>;

  // Build document order from page's childrenOrder (top-level blocks)
  const childrenOrder = (page.childrenOrder as string[] | undefined) ?? [];

  // Index blocks by id for O(1) lookup
  const blockById = new Map<string, Record<string, unknown>>();
  for (const b of allBlocks) {
    blockById.set(b.id as string, b);
  }

  // Walk childrenOrder to get document-ordered headings (top-level only for now)
  const headings: PageHeading[] = [];
  for (const id of childrenOrder) {
    const block = blockById.get(id);
    if (!block) continue;
    const type = block.type as string;
    if (!HEADING_TYPES.has(type)) continue;
    headings.push({ id, text: extractText(block), level: levelOf(type) });
  }

  // Also catch any headings not in childrenOrder (edge case: stale order)
  const seenIds = new Set(headings.map((h) => h.id));
  for (const block of allBlocks) {
    const type = block.type as string;
    if (!HEADING_TYPES.has(type)) continue;
    const id = block.id as string;
    if (!seenIds.has(id)) {
      headings.push({ id, text: extractText(block), level: levelOf(type) });
      seenIds.add(id);
    }
  }

  return { headings, isLoading };
}
