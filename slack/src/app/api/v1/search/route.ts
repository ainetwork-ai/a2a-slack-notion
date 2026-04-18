import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@/lib/db/schema';
import { searchPages } from '@/lib/notion/search';
import { getDefaultUser } from '@/lib/notion/auth';

export async function POST(request: NextRequest) {
  await getDefaultUser();

  const { query, workspaceId, createdBy, limit, offset } = await request.json();
  if (!query || !workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'query and workspaceId required' },
      { status: 400 },
    );
  }

  const meiliResult = await searchPages(query, workspaceId, { createdBy, limit, offset });

  if (meiliResult) {
    return NextResponse.json({
      object: 'list',
      results: meiliResult.hits,
      total: meiliResult.total,
      source: meiliResult.source,
    });
  }

  const q = String(query);
  const pgResults = await db
    .select({
      id: blocks.id,
      properties: blocks.properties,
      createdBy: blocks.createdBy,
      createdAt: blocks.createdAt,
      updatedAt: blocks.updatedAt,
    })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.type, 'page'),
        eq(blocks.archived, false),
        sql`${blocks.properties}->>'title' ILIKE ${'%' + q + '%'}`,
      ),
    )
    .limit(Number(limit ?? 20))
    .offset(Number(offset ?? 0));

  return NextResponse.json({
    object: 'list',
    results: pgResults.map((p) => ({
      id: p.id,
      ...(p.properties as Record<string, unknown>),
      createdBy: p.createdBy,
    })),
    total: pgResults.length,
    source: 'postgres_fallback',
  });
}
