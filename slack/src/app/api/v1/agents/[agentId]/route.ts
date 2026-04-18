/**
 * Single-agent GET/DELETE.
 *
 * Ported from the deleted Hono `routes/agents.ts#GET|DELETE /:agentId`. The
 * `removeAgent` helper from the Slack lib imports `@/lib/db` (which resolves
 * differently in the web app), so the cascade logic is inlined here.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { channelMembers, users } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  await getDefaultUser();
  const { agentId } = await params;

  const [found] = await db
    .select({
      id: users.id,
      name: users.displayName,
      image: users.avatarUrl,
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      agentStatus: users.status,
      isAgent: users.isAgent,
    })
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!found) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }
  return NextResponse.json(found);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  await getDefaultUser();
  const { agentId } = await params;

  try {
    await db.delete(channelMembers).where(eq(channelMembers.userId, agentId));
    await db
      .delete(users)
      .where(and(eq(users.id, agentId), eq(users.isAgent, true)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to remove agent' },
      { status: 400 },
    );
  }
}
