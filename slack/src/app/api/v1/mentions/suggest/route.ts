import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  workspaceMembers,
  users,
  blocks,
} from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

/**
 * Mention suggest endpoint used by the Notion editor (`@` autocomplete).
 *
 * - `type=user`  → returns *both* humans and agents that belong to the
 *                  workspace, so users can mention either kind from the same
 *                  popover. Each item carries `isAgent` + `a2aId` so the
 *                  client can style agent mentions distinctly and wire them
 *                  to the agent profile popup.
 * - `type=agent` → returns only agents (same shape).
 * - `type=page`  → workspace pages (unchanged).
 *
 * Workspace scoping is enforced by joining on `workspace_members`, so agents
 * registered in *other* workspaces never leak.
 */
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

  if (type === 'user' || type === 'agent') {
    const onlyAgents = type === 'agent';

    const conditions = [
      eq(workspaceMembers.workspaceId, workspaceId),
      ilike(users.displayName, `%${q}%`),
    ];
    if (onlyAgents) {
      conditions.push(eq(users.isAgent, true));
    }

    const results = await db
      .select({
        id: users.id,
        name: users.displayName,
        avatar: users.avatarUrl,
        isAgent: users.isAgent,
        a2aId: users.a2aId,
        agentStatus: users.status,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(...conditions))
      .limit(10);

    // Sort agents below humans for `type=user` so humans render first; the
    // notion `MentionList` separates them visually too.
    if (!onlyAgents) {
      results.sort((a, b) => {
        const aAgent = a.isAgent ? 1 : 0;
        const bAgent = b.isAgent ? 1 : 0;
        if (aAgent !== bAgent) return aAgent - bAgent;
        return a.name.localeCompare(b.name);
      });
    }

    return NextResponse.json(
      results.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.name,
        avatar: r.avatar ?? undefined,
        avatarUrl: r.avatar ?? undefined,
        isAgent: Boolean(r.isAgent),
        a2aId: r.a2aId ?? undefined,
        agentStatus: r.isAgent ? r.agentStatus : undefined,
      })),
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
