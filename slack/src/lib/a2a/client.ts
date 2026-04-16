import {
  type AgentCard,
  type AgentSkill,
  type Message,
  type Task,
  type TextPart,
  AGENT_CARD_PATH,
} from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { v4 as uuidv4 } from "uuid";

// Re-export SDK types for use throughout the app
export type { AgentCard, AgentSkill, Message, Task, TextPart };
export { AGENT_CARD_PATH };

/**
 * Fetch an agent card from a URL using the SDK's built-in resolver.
 */
export async function fetchAgentCard(inputUrl: string): Promise<AgentCard> {
  let url = inputUrl.replace(/\/$/, "");

  // If URL already ends with agent card path, strip it for the SDK
  if (
    url.endsWith("/.well-known/agent.json") ||
    url.endsWith("/.well-known/agent-card.json")
  ) {
    // Fetch directly since SDK expects base URL
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Failed to fetch agent card: ${res.status}`);
    return res.json();
  }

  // Use SDK's A2AClient to resolve agent card
  const client = new A2AClient(url);
  // The constructor triggers card fetch internally; we use fromCardUrl for explicit fetch
  const clientFromUrl = await A2AClient.fromCardUrl(
    `${url}/${AGENT_CARD_PATH}`
  );
  // Access the resolved card by sending a no-op — or fetch directly
  const res = await fetch(`${url}/${AGENT_CARD_PATH}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch agent card: ${res.status}`);
  return res.json();
}

/**
 * Send a message to an A2A agent using the SDK client.
 */
export async function sendA2AMessage(
  agentUrl: string,
  text: string,
  options?: {
    contextId?: string;
    taskId?: string;
    agentName?: string;
    skillId?: string;
  }
): Promise<{
  kind: string;
  content: string;
  taskId?: string;
  contextId?: string;
}> {
  const client = new A2AClient(agentUrl);

  const messageParts: Array<{ kind: "text"; text: string }> = [
    { kind: "text", text },
  ];

  const params = {
    message: {
      kind: "message" as const,
      messageId: uuidv4(),
      role: "user" as const,
      parts: messageParts,
      ...(options?.contextId && { contextId: options.contextId }),
      ...(options?.taskId && { taskId: options.taskId }),
      ...(options?.skillId && {
        metadata: { skillId: options.skillId },
      }),
    },
    configuration: {
      blocking: true,
      acceptedOutputModes: ["text/plain"],
    },
    ...(options?.agentName && {
      metadata: { agentName: options.agentName },
    }),
  };

  const response = await client.sendMessage(params);

  // Handle JSON-RPC error
  if ("error" in response) {
    throw new Error(
      (response as { error: { message: string } }).error.message || "A2A error"
    );
  }

  const result = (response as { result: unknown }).result;

  // Task response (has artifacts)
  if (result && typeof result === "object" && "artifacts" in result) {
    const task = result as {
      id?: string;
      contextId?: string;
      artifacts?: Array<{
        parts?: Array<{ kind: string; text?: string }>;
      }>;
    };
    const textPart = task.artifacts?.[0]?.parts?.find(
      (p) => p.kind === "text"
    );
    return {
      kind: "task",
      content: textPart?.text || "No response",
      taskId: task.id,
      contextId: task.contextId,
    };
  }

  // Message response (has parts directly)
  if (result && typeof result === "object" && "parts" in result) {
    const msg = result as {
      contextId?: string;
      parts?: Array<{ kind: string; text?: string }>;
    };
    const textPart = msg.parts?.find((p) => p.kind === "text");
    return {
      kind: "message",
      content: textPart?.text || "No response",
      contextId: msg.contextId,
    };
  }

  return { kind: "unknown", content: "No response" };
}

/**
 * Stream messages from an A2A agent using the SDK client.
 */
export async function* streamA2AMessage(
  agentUrl: string,
  text: string,
  options?: { agentName?: string; skillId?: string }
): AsyncGenerator<{ type: string; content: string }> {
  const client = new A2AClient(agentUrl);

  const params = {
    message: {
      kind: "message" as const,
      messageId: uuidv4(),
      role: "user" as const,
      parts: [{ kind: "text" as const, text }],
      ...(options?.skillId && {
        metadata: { skillId: options.skillId },
      }),
    },
    ...(options?.agentName && {
      metadata: { agentName: options.agentName },
    }),
  };

  const stream = client.sendMessageStream(params);

  for await (const event of stream) {
    if (!event || typeof event !== "object") continue;

    // TaskStatusUpdateEvent
    if ("status" in event) {
      const statusEvent = event as {
        status?: { message?: { parts?: Array<{ kind: string; text?: string }> } };
      };
      const textPart = statusEvent.status?.message?.parts?.find(
        (p) => p.kind === "text"
      );
      if (textPart?.text) yield { type: "status", content: textPart.text };
    }

    // TaskArtifactUpdateEvent
    if ("artifact" in event) {
      const artifactEvent = event as {
        artifact?: { parts?: Array<{ kind: string; text?: string }> };
      };
      const textPart = artifactEvent.artifact?.parts?.find(
        (p) => p.kind === "text"
      );
      if (textPart?.text) yield { type: "artifact", content: textPart.text };
    }
  }
}

/**
 * Extract the base URL from an agent card URL.
 */
export function extractBaseUrl(inputUrl: string): string {
  return inputUrl
    .replace(/\/?\.well-known\/agent(-card)?\.json$/, "")
    .replace(/\/$/, "");
}

/**
 * Analyze whether an agent should respond to a message.
 * Tries the agent's intent/analyze JSON-RPC method first, falls back to
 * keyword matching against skill tags and descriptions.
 */
export async function analyzeIntent(
  agentUrl: string,
  message: string,
  context: { channel: string; recentMessages: string[]; agentSkills: string[] }
): Promise<{
  shouldRespond: boolean;
  confidence: number;
  reason?: string;
  suggestedSkillId?: string;
}> {
  // Try JSON-RPC intent/analyze first
  try {
    const res = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "intent/analyze",
        params: { message, context },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.result && typeof data.result.shouldRespond === "boolean") {
        return data.result as {
          shouldRespond: boolean;
          confidence: number;
          reason?: string;
          suggestedSkillId?: string;
        };
      }
    }
  } catch {
    // Fall through to keyword matching
  }

  // Keyword fallback: tokenize message and check overlap with skill tokens
  const messageTokens = message
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (messageTokens.length === 0) {
    return { shouldRespond: false, confidence: 0, reason: "empty message" };
  }

  const skillTokens = context.agentSkills
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const skillTokenSet = new Set(skillTokens);
  const matches = messageTokens.filter((t) => skillTokenSet.has(t));
  const confidence = matches.length / messageTokens.length;

  return {
    shouldRespond: confidence > 0,
    confidence,
    reason: matches.length > 0 ? `keyword match: ${matches.slice(0, 3).join(", ")}` : "no keyword match",
  };
}
