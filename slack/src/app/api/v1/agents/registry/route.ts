/**
 * Agent registry — public view of agents in a workspace with internal URLs
 * stripped. Intended for consumption by other agents that want to discover
 * peers without learning their private a2a endpoints.
 *
 * Ported from the deleted Hono `routes/agents.ts#GET /registry`.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { users, workspaceMembers } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(request: Request) {
  await getDefaultUser();

  const workspaceId = new URL(request.url).searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.displayName,
      status: users.status,
      agentCardJson: users.agentCardJson,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isAgent, true)))
    .orderBy(users.displayName);

  return NextResponse.json(
    rows.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      skills: (a.agentCardJson as { skills?: unknown[] } | null)?.skills || [],
    })),
  );
}
