/**
 * Well-known agent card endpoint (A2A spec-compliant, per @a2a-js/sdk).
 *
 * GET /api/a2a/[agentId]/.well-known/agent.json   (legacy path)
 *
 * Looks the agent up by a2aId (human-readable slug) and lifts the stored card
 * to the full AgentCard shape defined by @a2a-js/sdk. Missing fields are filled
 * with safe defaults so every response is a valid A2A Agent Card.
 */

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import type { AgentCard } from "@a2a-js/sdk";

interface StoredCard {
  name?: string;
  description?: string;
  version?: string;
  protocolVersion?: string;
  capabilities?: AgentCard["capabilities"];
  skills?: Array<Record<string, unknown>>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  provider?: AgentCard["provider"];
  iconUrl?: string;
  documentationUrl?: string;
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

  const card = (agent.agentCardJson ?? {}) as StoredCard;

  // Base URL is /api/a2a/[agentId] — strip the /.well-known/* suffix
  const agentBaseUrl = request.url.replace(/\/\.well-known\/.*$/, "");

  const skillsRaw = Array.isArray(card.skills) ? card.skills : [];
  const skills = (skillsRaw.length > 0
    ? skillsRaw
    : [{ id: "default", name: "Chat", description: card.description, tags: ["chat"] }]
  ).map((s) => ({
    id:
      (s.id as string) ||
      String(s.name || "skill").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: (s.name as string) || "Unnamed skill",
    description: (s.description as string) || "",
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    examples: Array.isArray(s.examples) ? (s.examples as string[]) : [],
  }));

  const agentCard: AgentCard = {
    name: card.name ?? agent.displayName,
    description: card.description ?? `${agent.displayName} agent`,
    url: agentBaseUrl,
    protocolVersion: card.protocolVersion ?? "0.3.0",
    version: card.version ?? "1.0.0",
    provider: card.provider ?? { organization: "Slack-A2A", url: new URL(request.url).origin },
    capabilities: card.capabilities ?? {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: card.defaultInputModes ?? ["text/plain"],
    defaultOutputModes: card.defaultOutputModes ?? ["text/plain"],
    skills,
    ...(card.iconUrl ? { iconUrl: card.iconUrl } : {}),
    ...(card.documentationUrl ? { documentationUrl: card.documentationUrl } : {}),
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
