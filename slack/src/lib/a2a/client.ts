import { v4 as uuidv4 } from "uuid";

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  url?: string;
  iconUrl?: string;
  provider?: { organization: string; url?: string };
  capabilities?: { streaming?: boolean; pushNotifications?: boolean };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: AgentSkill[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export async function fetchAgentCard(inputUrl: string): Promise<AgentCard> {
  let url = inputUrl.replace(/\/$/, "");

  // If URL already ends with .well-known/agent.json, use as-is
  if (url.endsWith("/.well-known/agent.json") || url.endsWith("/.well-known/agent-card.json")) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Failed to fetch agent card: ${res.status}`);
    return res.json();
  }

  // Try /.well-known/agent.json first, then /.well-known/agent-card.json
  for (const path of ["/.well-known/agent.json", "/.well-known/agent-card.json"]) {
    try {
      const res = await fetch(`${url}${path}`, { headers: { Accept: "application/json" } });
      if (res.ok) return res.json();
    } catch {
      continue;
    }
  }

  throw new Error("Failed to fetch agent card from any known path");
}

export function extractBaseUrl(inputUrl: string): string {
  return inputUrl.replace(/\/?\.well-known\/agent(-card)?\.json$/, "").replace(/\/$/, "");
}

export async function sendA2AMessage(
  agentUrl: string,
  text: string,
  options?: { contextId?: string; taskId?: string; agentName?: string; skillId?: string }
): Promise<{ kind: string; content: string; taskId?: string; contextId?: string }> {
  const url = agentUrl.replace(/\/$/, "");

  const message: Record<string, unknown> = {
    messageId: uuidv4(),
    role: "user",
    parts: [{ kind: "text", text }],
    kind: "message",
  };
  if (options?.contextId) message.contextId = options.contextId;
  if (options?.taskId) message.taskId = options.taskId;

  const params: Record<string, unknown> = {
    message,
    configuration: {
      blocking: true,
      acceptedOutputModes: ["text/plain"],
    },
  };
  if (options?.agentName) {
    params.metadata = { agentName: options.agentName };
  }
  if (options?.skillId) {
    (message as Record<string, unknown>).metadata = { skillId: options.skillId };
  }

  const res = await fetch(`${url}/api/a2a`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "message/send",
      params,
      id: uuidv4(),
    }),
  });

  if (!res.ok) throw new Error(`A2A request failed: ${res.status}`);
  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || "A2A error");
  }

  const result = data.result;
  if (result?.kind === "task") {
    const textPart = result.artifacts?.[0]?.parts?.find(
      (p: { kind: string }) => p.kind === "text"
    );
    return {
      kind: "task",
      content: textPart?.text || "No response",
      taskId: result.id,
      contextId: result.contextId,
    };
  }

  const textPart = result?.parts?.find(
    (p: { kind: string }) => p.kind === "text"
  );
  return {
    kind: "message",
    content: textPart?.text || "No response",
    contextId: result?.contextId,
  };
}

export async function* streamA2AMessage(
  agentUrl: string,
  text: string,
  options?: { agentName?: string; skillId?: string }
): AsyncGenerator<{ type: string; content: string }> {
  const url = agentUrl.replace(/\/$/, "");

  const message: Record<string, unknown> = {
    messageId: uuidv4(),
    role: "user",
    parts: [{ kind: "text", text }],
    kind: "message",
  };
  if (options?.skillId) {
    message.metadata = { skillId: options.skillId };
  }

  const params: Record<string, unknown> = { message };
  if (options?.agentName) {
    params.metadata = { agentName: options.agentName };
  }

  const res = await fetch(`${url}/api/a2a`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "message/stream",
      params,
      id: uuidv4(),
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`A2A stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.kind === "status-update" && data.status?.message?.parts) {
            const textPart = data.status.message.parts.find(
              (p: { kind: string }) => p.kind === "text"
            );
            if (textPart) yield { type: "status", content: textPart.text };
          } else if (data.kind === "artifact-update" && data.artifact?.parts) {
            const textPart = data.artifact.parts.find(
              (p: { kind: string }) => p.kind === "text"
            );
            if (textPart) yield { type: "artifact", content: textPart.text };
          }
        } catch {
          // skip malformed SSE
        }
      }
    }
  }
}
