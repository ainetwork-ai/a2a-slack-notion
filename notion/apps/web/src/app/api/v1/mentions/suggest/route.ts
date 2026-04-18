import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  workspaceMembers,
  users,
  blocks,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'user';
  const q = url.searchParams.get('q') ?? '';
  const workspaceId = url.searchParams.get('workspace_id');

  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' },
      { status: 400 },
    );
  }

  if (type === 'user') {
    const results = await db
      .select({
        id: users.id,
        name: users.displayName,
        avatar: users.avatarUrl,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          ilike(users.displayName, `%${q}%`),
        ),
      )
      .limit(5);

    return NextResponse.json(
      results.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar ?? undefined })),
    );
  }

  if (type === 'page') {
    const pages = await db
      .select({ id: blocks.id, properties: blocks.properties })
      .from(blocks)
      .where(
        and(
          eq(blocks.workspaceId, workspaceId),
          eq(blocks.type, 'page'),
          eq(blocks.archived, false),
          sql`${blocks.properties}->>'title' ILIKE ${'%' + q + '%'}`,
        ),
      )
      .limit(5);

    const results = pages.map((p) => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        name: (props['title'] as string) ?? 'Untitled',
        icon: (props['icon'] as string | undefined) ?? undefined,
      };
    });

    return NextResponse.json(results);
  }

  return NextResponse.json([]);
}
