/**
 * Dynamic A2A agent endpoints.
 *
 * GET  /api/a2a/[agentId]              → agent card JSON (A2A spec)
 * POST /api/a2a/[agentId]              → JSON-RPC handler (message/send)
 *
 * The agent card's `url` field is set to the current request URL so external
 * A2A clients can discover and call back to this endpoint.
 */

import { db } from "@/lib/db";
import { users, agentSkillConfigs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { callVLLM } from "@/lib/a2a/vllm-handler";
import { v4 as uuidv4 } from "uuid";

interface AgentCardJson {
  name?: string;
  description?: string;
  systemPrompt?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  skills?: Array<{ id?: string; name?: string; description?: string; tags?: string[]; examples?: string[]; [key: string]: unknown }>;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  provider?: unknown;
  [key: string]: unknown;
}

/**
 * Build an A2A standard-compliant agent card.
 * Only includes: id, name, description, url, skills (with id, name, description, tags, examples).
 * Internal fields (systemPrompt, mcpAccess, etc.) are excluded.
 */
function buildAgentCard(
  agentId: string,
  card: AgentCardJson,
  agentName: string,
  requestUrl: string
): Record<string, unknown> {
  const agentBaseUrl = requestUrl.replace(/\/$/, "");

  // Build skills with only standard A2A fields
  const rawSkills = card.skills ?? [];
  const skills = rawSkills.length > 0
    ? rawSkills.map((s) => ({
        id: s.id ?? "default",
        name: s.name ?? "Chat",
        description: s.description ?? `Talk to ${agentName}`,
        tags: s.tags ?? ["chat"],
        ...(s.examples ? { examples: s.examples } : {}),
      }))
    : [
        {
          id: "default",
          name: "Chat",
          description: card.description ?? `Talk to ${agentName}`,
          tags: ["chat"],
        },
      ];

  return {
    id: agentId,
    name: card.name ?? agentName,
    description: card.description ?? `${agentName} agent`,
    url: agentBaseUrl,
    skills,
  };
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
      a2aUrl: users.a2aUrl,
      agentCardJson: users.agentCardJson,
      isAgent: users.isAgent,
    })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent || !agent.isAgent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const card = (agent.agentCardJson ?? {}) as AgentCardJson;
  const agentCard = buildAgentCard(
    agentId,
    card,
    agent.displayName,
    request.url
  );

  return NextResponse.json(agentCard, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST(
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
    .where(eq(users.id, agentId))
    .limit(1);

  if (!agent || !agent.isAgent) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Agent not found" }, id: null },
      { status: 404 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
      { status: 400 }
    );
  }

  const rpcId = body.id ?? null;
  const method = body.method as string | undefined;
  const rpcParams = body.params as Record<string, unknown> | undefined;

  if (method !== "message/send") {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32601, message: `Method not found: ${method}` },
      id: rpcId,
    });
  }

  // Extract text and skillId from A2A message parts/metadata
  let userText = "";
  let skillId: string | undefined;
  try {
    const msg = rpcParams?.message as Record<string, unknown> | undefined;
    const parts = (msg?.parts ?? []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if (part.kind === "text" && typeof part.text === "string") {
        userText += part.text;
      }
    }
    const metadata = msg?.metadata as Record<string, unknown> | undefined;
    if (metadata?.skillId && typeof metadata.skillId === "string") {
      skillId = metadata.skillId;
    }
  } catch {
    userText = "";
  }

  if (!userText) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32602, message: "No text content in message" },
      id: rpcId,
    });
  }

  const card = (agent.agentCardJson ?? {}) as AgentCardJson;
  let systemPrompt =
    card.systemPrompt ?? `You are ${agent.displayName}, a helpful assistant.`;

  // If a skillId was provided, look up the skill config and append its instruction
  if (skillId) {
    const [skillConfig] = await db
      .select()
      .from(agentSkillConfigs)
      .where(
        and(
          eq(agentSkillConfigs.agentId, agentId),
          eq(agentSkillConfigs.skillId, skillId)
        )
      )
      .limit(1);

    if (skillConfig) {
      systemPrompt = `${systemPrompt}\n\n## Skill: ${skillId}\n${skillConfig.instruction}`;
      if (skillConfig.mcpTools && skillConfig.mcpTools.length > 0) {
        systemPrompt += `\n\nAvailable tools for this skill: ${skillConfig.mcpTools.join(", ")}`;
      }
    }
  }

  let responseText: string;
  try {
    responseText = await callVLLM(systemPrompt, userText);
  } catch (err) {
    responseText = `I'm having trouble responding right now. (${err instanceof Error ? err.message : "Unknown error"})`;
  }

  const taskId = uuidv4();
  const contextId = (rpcParams?.message as Record<string, unknown> | undefined)
    ?.contextId as string | undefined ?? uuidv4();

  return NextResponse.json({
    jsonrpc: "2.0",
    id: rpcId,
    result: {
      id: taskId,
      contextId,
      status: { state: "completed" },
      artifacts: [
        {
          artifactId: uuidv4(),
          parts: [{ kind: "text", text: responseText }],
        },
      ],
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
