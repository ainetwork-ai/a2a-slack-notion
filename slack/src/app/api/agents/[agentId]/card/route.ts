import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/agents/:agentId/card
 * Returns the A2A agent card in standard format.
 * This serves as the .well-known/agent-card.json equivalent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, agentId), eq(users.isAgent, true)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const card = agent.agentCardJson as Record<string, unknown> | null;
  if (!card) {
    return NextResponse.json({ error: "No agent card" }, { status: 404 });
  }

  // Return A2A-compliant agent card
  return NextResponse.json({
    ...card,
    url: `/api/agents/${agentId}/card`,
  }, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
