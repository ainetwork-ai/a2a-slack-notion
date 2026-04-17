/**
 * POST /api/blocks/:id/query
 *
 * Query child pages of a database block, with optional filter + sort.
 *
 * Body: {
 *   filter?: { property: string; op: 'equals' | 'contains'; value: unknown };
 *   sort?: { property: string; direction: 'asc' | 'desc' }[];
 *   limit?: number;
 *   cursor?: string;
 * }
 *
 * Returns: { results: BlockRow[], nextCursor?: string }
 */

import { db } from '@/lib/db';
import { blocks } from '@/lib/db/schema';
import { eq, and, or, lt, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { getPage, canAccess } from '@/lib/notion/page-access';

// ─── Cursor helpers ───────────────────────────────────────────────────────────

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const colonIdx = raw.indexOf(':');
    if (colonIdx === -1) return null;
    const createdAt = new Date(raw.slice(0, colonIdx));
    const id = raw.slice(colonIdx + 1);
    if (isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Filter {
  property: string;
  op: 'equals' | 'contains';
  value: unknown;
}

interface Sort {
  property: string;
  direction: 'asc' | 'desc';
}

interface QueryBody {
  filter?: Filter;
  sort?: Sort[];
  limit?: number;
  cursor?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;

  const { id } = await params;

  // Fetch the database block
  const [dbBlock] = await db.select().from(blocks).where(eq(blocks.id, id)).limit(1);
  if (!dbBlock) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }
  if (dbBlock.type !== 'database') {
    return NextResponse.json({ error: 'Block is not a database' }, { status: 400 });
  }

  // Access check via parent page
  const page = await getPage(dbBlock.pageId);
  if (!page) {
    return NextResponse.json({ error: 'Parent page not found' }, { status: 404 });
  }
  if (!(await canAccess(auth.user.id, page, 'view'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as QueryBody;
  const rawLimit = typeof body.limit === 'number' ? body.limit : 20;
  const limit = Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100);

  // Build base conditions: child pages of this database block
  const conditions: ReturnType<typeof eq>[] = [
    eq(blocks.parentId, id),
    eq(blocks.type, 'page'),
    eq(blocks.archived, false),
  ];

  // Cursor pagination
  if (body.cursor) {
    const decoded = decodeCursor(body.cursor);
    if (decoded) {
      conditions.push(
        or(
          lt(blocks.createdAt, decoded.createdAt),
          and(eq(blocks.createdAt, decoded.createdAt), lt(blocks.id, decoded.id))!
        ) as ReturnType<typeof eq>
      );
    }
  }

  // Fetch all matching rows for in-memory filter/sort (MVP: simple property filter)
  let rows = await db
    .select()
    .from(blocks)
    .where(and(...conditions))
    .orderBy(sql`${blocks.createdAt} desc, ${blocks.id} desc`);

  // Apply in-memory property filter
  if (body.filter) {
    const { property, op, value } = body.filter;
    rows = rows.filter((row) => {
      const props = row.properties as Record<string, unknown>;
      const propValue = props[property];
      if (op === 'equals') {
        return propValue === value;
      }
      if (op === 'contains') {
        return typeof propValue === 'string' && typeof value === 'string'
          ? propValue.toLowerCase().includes(value.toLowerCase())
          : false;
      }
      return true;
    });
  }

  // Apply in-memory sort (user-specified overrides default createdAt desc)
  if (body.sort && body.sort.length > 0) {
    rows = rows.sort((a, b) => {
      for (const s of body.sort!) {
        const aProps = a.properties as Record<string, unknown>;
        const bProps = b.properties as Record<string, unknown>;
        const aVal = aProps[s.property];
        const bVal = bProps[s.property];
        const cmp =
          aVal == null
            ? 1
            : bVal == null
            ? -1
            : aVal < bVal
            ? -1
            : aVal > bVal
            ? 1
            : 0;
        if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && results.length > 0
      ? encodeCursor(results[results.length - 1].createdAt, results[results.length - 1].id)
      : undefined;

  return NextResponse.json({ results, ...(nextCursor ? { nextCursor } : {}) });
}
