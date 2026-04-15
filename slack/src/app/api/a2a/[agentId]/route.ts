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
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { callVLLM } from "@/lib/a2a/vllm-handler";
import { v4 as uuidv4 } from "uuid";

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

function buildAgentCard(
  agentId: string,
  card: AgentCardJson,
  agentName: string,
  requestUrl: string
): Record<string, unknown> {
  // The canonical base URL for this agent
  const agentBaseUrl = requestUrl.replace(/\/$/, "");

  return {
    name: card.name ?? agentName,
    description: card.description ?? `${agentName} agent`,
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
        description: card.description ?? `Talk to ${agentName}`,
        tags: ["chat"],
      },
    ],
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

  // Extract text from A2A message parts
  let userText = "";
  try {
    const msg = rpcParams?.message as Record<string, unknown> | undefined;
    const parts = (msg?.parts ?? []) as Array<Record<string, unknown>>;
    for (const part of parts) {
      if (part.kind === "text" && typeof part.text === "string") {
        userText += part.text;
      }
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
  const systemPrompt =
    card.systemPrompt ?? `You are ${agent.displayName}, a helpful assistant.`;

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
