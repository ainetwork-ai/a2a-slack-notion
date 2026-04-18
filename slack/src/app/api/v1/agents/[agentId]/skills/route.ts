/**
 * List the skills advertised by an agent's stored agent card.
 *
 * Ported from the deleted Hono `routes/agents.ts#GET /:agentId/skills`. The
 * Slack lib's `getAgentSkills` helper can't be imported directly (its
 * `@/lib/db` alias differs), so the lookup is inlined.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { users } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  await getDefaultUser();
  const { agentId } = await params;

  const [agent] = await db
    .select({ agentCardJson: users.agentCardJson })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent?.agentCardJson) {
    return NextResponse.json([]);
  }

  const card = agent.agentCardJson as { skills?: unknown[] };
  return NextResponse.json(card.skills || []);
}
