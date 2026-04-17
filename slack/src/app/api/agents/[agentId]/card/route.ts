import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import type { AgentCard } from "@a2a-js/sdk";

/**
 * GET /api/agents/:agentId/card
 * Returns the A2A-spec-compliant agent card (per @a2a-js/sdk AgentCard interface).
 * Works as the `.well-known/agent-card.json` equivalent — legacy/minimal stored
 * cards are lifted into spec-shape on the fly.
 */
export async function GET(
  request: NextRequest,
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

  const raw = (agent.agentCardJson as Record<string, unknown> | null) || {};
  const origin = new URL(request.url).origin;
  const a2aEndpoint = agent.a2aUrl || `${origin}/api/a2a/${agent.a2aId || agent.id}`;

  // Normalise skills to A2A spec shape (id, name, description, tags, examples)
  const rawSkills = Array.isArray(raw.skills) ? (raw.skills as Record<string, unknown>[]) : [];
  const skills = rawSkills.map((s) => ({
    id:
      (s.id as string) ||
      String(s.name || "skill").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: (s.name as string) || "Unnamed skill",
    description: (s.description as string) || "",
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    examples: Array.isArray(s.examples) ? (s.examples as string[]) : [],
  }));

  const card: AgentCard = {
    name: (raw.name as string) || agent.displayName,
    description: (raw.description as string) || "",
    url: (raw.url as string) || a2aEndpoint,
    protocolVersion: (raw.protocolVersion as string) || "0.3.0",
    version: (raw.version as string) || "1.0.0",
    provider:
      (raw.provider as AgentCard["provider"]) || { organization: "Slack-A2A", url: origin },
    defaultInputModes:
      (raw.defaultInputModes as string[]) || ["text/plain"],
    defaultOutputModes:
      (raw.defaultOutputModes as string[]) || ["text/plain"],
    capabilities:
      (raw.capabilities as AgentCard["capabilities"]) || {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
    skills,
    ...(raw.iconUrl ? { iconUrl: raw.iconUrl as string } : {}),
    ...(raw.documentationUrl
      ? { documentationUrl: raw.documentationUrl as string }
      : {}),
  };

  return NextResponse.json(card, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
