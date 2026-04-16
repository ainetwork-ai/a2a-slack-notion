/**
 * Well-known agent card endpoint.
 *
 * GET /api/a2a/[agentId]/.well-known/agent.json
 *
 * A2A spec requires agents to expose their card at /.well-known/agent.json
 * relative to their base URL. This route serves that path.
 */

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

interface AgentCardJson {
  name?: string;
  description?: string;
  systemPrompt?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  skills?: unknown[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  provider?: unknown;
  [key: string]: unknown;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  const [agent] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      agentCardJson: users.agentCardJson,
      isAgent: users.isAgent,
    })
    .from(users)
    .where(eq(users.a2aId, agentId))
    .limit(1);

  if (!agent || !agent.isAgent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const card = (agent.agentCardJson ?? {}) as AgentCardJson;

  // Base URL is /api/a2a/[agentId] — strip the /.well-known/agent.json suffix
  const agentBaseUrl = request.url
    .replace(/\/\.well-known\/agent\.json.*$/, "");

  const agentCard = {
    name: card.name ?? agent.displayName,
    description: card.description ?? `${agent.displayName} agent`,
    version: card.version ?? "1.0.0",
    url: agentBaseUrl,
    provider: card.provider ?? { organization: "Slack-A2A" },
    capabilities: card.capabilities ?? {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: card.defaultInputModes ?? ["text/plain"],
    defaultOutputModes: card.defaultOutputModes ?? ["text/plain"],
    skills: card.skills ?? [
      {
        id: "default",
        name: "Chat",
        description: card.description ?? `Talk to ${agent.displayName}`,
        tags: ["chat"],
      },
    ],
  };

  return NextResponse.json(agentCard, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
