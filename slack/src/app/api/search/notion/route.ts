/**
 * GET /api/search/notion?workspaceId=&q=&types=&limit=
 *
 * Notion-scoped search. Wraps Meilisearch indexes for pages and blocks,
 * with a graceful Postgres ILIKE fallback when Meilisearch is unavailable.
 *
 * types: comma-separated subset of "page,database,block,comment"
 *   - "page"     → pages Meili index (type=page blocks)
 *   - "database" → blocks Meili index filtered to type=database
 *   - "block"    → blocks Meili index (all indexed block types)
 *   - "comment"  → Postgres ILIKE only (no Meili index for comments)
 *
 * Returns: { hits: HitItem[], total: number }
 * Each hit is annotated with a "type" field.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { blocks, blockComments, workspaceMembers } from '@/lib/db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { meili } from '@/lib/search/meili-client';
import { INDEX_PAGES, INDEX_BLOCKS } from '@/lib/search/indexes';
import type { MeiliPage, MeiliBlock } from '@/lib/search/indexer';

type NotionType = 'page' | 'database' | 'block' | 'comment';
const ALL_TYPES: NotionType[] = ['page', 'database', 'block', 'comment'];

interface HitItem {
  id: string;
  type: NotionType;
  [key: string]: unknown;
}

// ─── Meilisearch search (may throw if unavailable) ───────────────────────────

async function meiliSearch(
  q: string,
  workspaceId: string,
  types: Set<NotionType>,
  limit: number,
): Promise<HitItem[]> {
  const hits: HitItem[] = [];

  const wFilter = `workspaceId = "${workspaceId}"`;

  if (types.has('page')) {
    const res = await meili
      .index(INDEX_PAGES.uid)
      .search<MeiliPage>(q, { filter: wFilter, limit });
    for (const h of res.hits) {
      hits.push({ ...h, type: 'page' as NotionType });
    }
  }

  if (types.has('database') || types.has('block')) {
    const blockFilter = types.has('database') && !types.has('block')
      ? `${wFilter} AND type = "database"`
      : wFilter;
    const res = await meili
      .index(INDEX_BLOCKS.uid)
      .search<MeiliBlock>(q, { filter: blockFilter, limit });
    for (const h of res.hits) {
      const hitType: NotionType = h.type === 'database' ? 'database' : 'block';
      if (types.has(hitType)) {
        hits.push({ ...h, type: hitType });
      }
    }
  }

  return hits;
}

// ─── Postgres ILIKE fallback ──────────────────────────────────────────────────

async function pgSearch(
  q: string,
  workspaceId: string,
  types: Set<NotionType>,
  limit: number,
): Promise<HitItem[]> {
  const hits: HitItem[] = [];
  const likeQ = `%${q}%`;

  if (types.has('page') || types.has('database') || types.has('block')) {
    const typeConditions = [];
    if (types.has('page')) typeConditions.push(eq(blocks.type, 'page'));
    if (types.has('database')) typeConditions.push(eq(blocks.type, 'database'));
    if (types.has('block')) {
      typeConditions.push(
        and(
          sql`${blocks.type} NOT IN ('page','database')`,
          ilike(sql`${blocks.properties}->>'text'`, likeQ),
        ) as ReturnType<typeof eq>,
      );
    }

    const blockConditions = [
      eq(blocks.workspaceId, workspaceId),
      eq(blocks.archived, false),
      or(
        ilike(sql`${blocks.properties}->>'title'`, likeQ),
        ilike(sql`${blocks.content}->>'text'`, likeQ),
      ) as ReturnType<typeof eq>,
    ];

    if (typeConditions.length > 0) {
      blockConditions.push(or(...typeConditions) as ReturnType<typeof eq>);
    }

    const rows = await db
      .select()
      .from(blocks)
      .where(and(...blockConditions))
      .limit(limit);

    for (const row of rows) {
      const hitType: NotionType =
        row.type === 'page' ? 'page' : row.type === 'database' ? 'database' : 'block';
      hits.push({ ...row, type: hitType });
    }
  }

  if (types.has('comment') && q) {
    // Comments: join to blocks to get workspaceId
    const commentRows = await db
      .select({ comment: blockComments, block: blocks })
      .from(blockComments)
      .innerJoin(blocks, eq(blockComments.blockId, blocks.id))
      .where(
        and(
          eq(blocks.workspaceId, workspaceId),
          ilike(sql`${blockComments.content}::text`, likeQ),
        ),
      )
      .limit(limit);

    for (const { comment } of commentRows) {
      hits.push({ ...comment, type: 'comment' as NotionType });
    }
  }

  return hits;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error as NextResponse;

  const { searchParams } = new URL(req.url);

  const workspaceId = searchParams.get('workspaceId');
  const q = searchParams.get('q')?.trim() ?? '';
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100);
  const typesParam = searchParams.get('types');

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }

  if (!q) {
    return NextResponse.json({ hits: [], total: 0 });
  }

  // Workspace membership check
  const [wm] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, auth.user.id)))
    .limit(1);
  if (!wm) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse types filter
  const requestedTypes: Set<NotionType> = typesParam
    ? new Set(
        typesParam
          .split(',')
          .map((t) => t.trim() as NotionType)
          .filter((t) => ALL_TYPES.includes(t)),
      )
    : new Set(ALL_TYPES);

  if (requestedTypes.size === 0) {
    return NextResponse.json({ hits: [], total: 0 });
  }

  let hits: HitItem[];

  try {
    hits = await meiliSearch(q, workspaceId, requestedTypes, limit);
  } catch {
    // Meilisearch unavailable — fall back to Postgres ILIKE
    hits = await pgSearch(q, workspaceId, requestedTypes, limit);
  }

  return NextResponse.json({ hits, total: hits.length });
}
