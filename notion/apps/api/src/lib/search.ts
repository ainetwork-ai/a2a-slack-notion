import { Meilisearch } from 'meilisearch';
import { createLogger } from '@notion/shared';

const logger = createLogger('search');

export const meili = new Meilisearch({
  host: process.env['MEILI_URL'] ?? 'http://localhost:7700',
  apiKey: process.env['MEILI_MASTER_KEY'] ?? 'meili_master_key_change_me',
});

const PAGES_INDEX = 'pages';

export async function ensureSearchIndex() {
  try {
    await meili.createIndex(PAGES_INDEX, { primaryKey: 'id' });
    await meili.index(PAGES_INDEX).updateFilterableAttributes([
      'workspaceId',
      'createdBy',
      'type',
    ]);
    await meili.index(PAGES_INDEX).updateSearchableAttributes([
      'title',
      'textContent',
    ]);
    logger.info('Search index configured');
  } catch {
    logger.warn('Meilisearch not available — search will use PG fallback');
  }
}

export async function indexPage(page: {
  id: string;
  workspaceId: string;
  title: string;
  textContent: string;
  createdBy: string;
  type: string;
  updatedAt: string;
}) {
  try {
    await meili.index(PAGES_INDEX).addDocuments([page]);
  } catch {
    logger.warn({ pageId: page.id }, 'Failed to index page — Meilisearch unavailable');
  }
}

export async function removePage(pageId: string) {
  try {
    await meili.index(PAGES_INDEX).deleteDocument(pageId);
  } catch {
    // Ignore — best effort
  }
}

export async function searchPages(
  query: string,
  workspaceId: string,
  options?: { limit?: number; offset?: number; createdBy?: string },
) {
  try {
    const filter = [`workspaceId = "${workspaceId}"`];
    if (options?.createdBy) filter.push(`createdBy = "${options.createdBy}"`);

    const result = await meili.index(PAGES_INDEX).search(query, {
      filter,
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
    });

    return { hits: result.hits, total: result.estimatedTotalHits, source: 'meilisearch' as const };
  } catch {
    // Decision #10: MeilisearchUnavailable → PG LIKE fallback
    return null;
  }
}
