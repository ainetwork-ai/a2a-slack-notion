/**
 * Agents collection route.
 *
 * GET  /api/v1/agents?workspace_id=...  — list agents scoped to a workspace.
 * POST /api/v1/agents                    — invite (register) a new agent by a2a URL.
 *
 * Ported from the deleted Hono `routes/agents.ts`. The original depended on a
 * `listAgents(workspaceId)` helper and an `inviteAgent(a2aUrl, workspaceId)`
 * helper from `../lib/a2a/agent-manager.js` — neither helper is available in
 * the Slack lib in a form we can import directly (the Slack version imports
 * `@/lib/db`, which resolves to a different path in the web app), so the
 * equivalent logic is inlined here and uses `fetchAgentCard` from the
 * Slack client.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { users, workspaceMembers } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { fetchAgentCard } from '@/lib/a2a/client';

async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(membership);
}

export async function GET(request: Request) {
  await getDefaultUser();

  const workspaceId = new URL(request.url).searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  // Agents visible in a workspace = agent users (isAgent=true) that are members
  // of that workspace via workspace_members.
  const rows = await db
    .select({
      id: users.id,
      a2aId: users.a2aId,
      name: users.displayName,
      image: users.avatarUrl,
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      agentStatus: users.status,
      isAgent: users.isAgent,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isAgent, true)))
    .orderBy(users.displayName);

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await getDefaultUser();

  const body = (await request.json().catch(() => ({}))) as {
    a2aUrl?: string;
    workspace_id?: string;
  };
  const { a2aUrl, workspace_id } = body;

  if (!a2aUrl || !workspace_id) {
    return NextResponse.json(
      { error: 'a2aUrl and workspace_id required' },
      { status: 400 },
    );
  }

  if (!(await isWorkspaceMember(user.id, workspace_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const card = await fetchAgentCard(a2aUrl);

    // Upsert the agent user. If an agent with the same a2aUrl already exists,
    // refresh its card and reuse the row — this mirrors the Slack
    // `inviteAgent` helper.
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.a2aUrl, a2aUrl))
      .limit(1);

    let agentRow;
    if (existing) {
      await db
        .update(users)
        .set({
          agentCardJson: card as unknown as Record<string, unknown>,
          avatarUrl: card.iconUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      agentRow = existing;
    } else {
      const ainAddress = `agent-${card.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      const nameSlug = card.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const a2aId = nameSlug || null;

      const [inserted] = await db
        .insert(users)
        .values({
          ainAddress,
          displayName: card.name,
          avatarUrl: card.iconUrl || null,
          isAgent: true,
          a2aUrl,
          a2aId,
          agentCardJson: card as unknown as Record<string, unknown>,
          status: 'online',
          agentInvitedBy: user.id,
          agentVisibility: 'private',
        })
        .returning();

      if (!inserted) {
        return NextResponse.json(
          { error: 'Failed to insert agent' },
          { status: 500 },
        );
      }
      agentRow = inserted;
    }

    // Ensure the agent is a member of the inviting workspace so the list
    // endpoint above returns it.
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace_id, userId: agentRow.id, role: 'member' })
      .onConflictDoNothing();

    return NextResponse.json(agentRow, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to invite agent' },
      { status: 400 },
    );
  }
}
