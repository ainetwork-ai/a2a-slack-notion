/**
 * Agent health check — probes the remote agent's card URL and updates its
 * status in the users table.
 *
 * Ported from the deleted Hono `routes/agents.ts#POST /:agentId/health`. The
 * helper in the Slack lib can't be imported directly (its `@/lib/db` alias
 * resolves differently in the web app), so the probe is inlined here.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { users } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { fetchAgentCard } from '@/lib/a2a/client';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  await getDefaultUser();
  const { agentId } = await params;

  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent?.a2aUrl) {
    return NextResponse.json({ agentId, status: 'offline' });
  }

  try {
    const card = await fetchAgentCard(agent.a2aUrl);
    await db
      .update(users)
      .set({
        agentCardJson: card as unknown as Record<string, unknown>,
        avatarUrl: card.iconUrl || null,
        status: 'online',
        updatedAt: new Date(),
      })
      .where(eq(users.id, agentId));
    return NextResponse.json({ agentId, status: 'online' });
  } catch {
    await db
      .update(users)
      .set({ status: 'offline', updatedAt: new Date() })
      .where(eq(users.id, agentId));
    return NextResponse.json({ agentId, status: 'offline' });
  }
}
