export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
}

export interface AgentCard {
  name: string;
  description?: string;
  version?: string;
  url?: string;
  iconUrl?: string;
  provider?: { organization: string };
  capabilities?: { streaming?: boolean; pushNotifications?: boolean };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: AgentSkill[];
}

function extractBaseUrl(inputUrl: string): string {
  return inputUrl
    .replace(/\/.well-known\/agent(-card)?\.json$/i, '')
    .replace(/\/+$/, '');
}

export async function fetchAgentCard(inputUrl: string): Promise<AgentCard> {
  const baseUrl = extractBaseUrl(inputUrl);

  // Try /.well-known/agent.json first
  const paths = ['/.well-known/agent.json', '/.well-known/agent-card.json'];

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`);
      if (res.ok) {
        return await res.json() as AgentCard;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to fetch agent card from ${baseUrl}`);
}

export async function sendA2AMessage(
  agentUrl: string,
  text: string,
  options?: { contextId?: string; taskId?: string; agentName?: string; skillId?: string },
): Promise<{ kind: string; content: string; taskId?: string; contextId?: string }> {
  const messageId = crypto.randomUUID();

  const payload = {
    jsonrpc: '2.0',
    method: 'message/send',
    params: {
      message: {
        messageId,
        role: 'user',
        parts: [{ kind: 'text', text }],
        kind: 'message',
        ...(options?.contextId && { contextId: options.contextId }),
        ...(options?.taskId && { taskId: options.taskId }),
      },
      configuration: {
        blocking: true,
        acceptedOutputModes: ['text/plain'],
      },
    },
    id: messageId,
  };

  const res = await fetch(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`A2A request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as any;
  const result = data.result;

  if (!result) {
    throw new Error('A2A response has no result');
  }

  // Handle both task and message result kinds
  if (result.kind === 'task' || result.status) {
    const artifacts = result.artifacts || result.status?.message?.parts || [];
    const parts = artifacts.flatMap((a: any) => a.parts || []);
    const content = parts
      .filter((p: any) => p.kind === 'text')
      .map((p: any) => p.text)
      .join('\n');
    return {
      kind: 'task',
      content,
      taskId: result.id || result.taskId,
      contextId: result.contextId,
    };
  }

  // Direct message response
  const parts = result.parts || [];
  const content = parts
    .filter((p: any) => p.kind === 'text')
    .map((p: any) => p.text)
    .join('\n');
  return { kind: 'message', content };
}

export async function* streamA2AMessage(
  agentUrl: string,
  text: string,
  options?: { agentName?: string; skillId?: string },
): AsyncGenerator<{ type: string; content: string }> {
  const messageId = crypto.randomUUID();

  const payload = {
    jsonrpc: '2.0',
    method: 'message/stream',
    params: {
      message: {
        messageId,
        role: 'user',
        parts: [{ kind: 'text', text }],
        kind: 'message',
      },
      configuration: {
        acceptedOutputModes: ['text/plain'],
      },
    },
    id: messageId,
  };

  const res = await fetch(agentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    throw new Error(`A2A stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const event = JSON.parse(raw);
        const result = event.result;
        if (!result) continue;

        if (result.kind === 'status-update') {
          const parts = result.status?.message?.parts || [];
          const text = parts.filter((p: any) => p.kind === 'text').map((p: any) => p.text).join('');
          if (text) yield { type: 'status', content: text };
        } else if (result.kind === 'artifact-update') {
          const parts = result.artifact?.parts || [];
          const text = parts.filter((p: any) => p.kind === 'text').map((p: any) => p.text).join('');
          if (text) yield { type: 'artifact', content: text };
        }
      } catch {
        // Skip malformed SSE events
      }
    }
  }
}
