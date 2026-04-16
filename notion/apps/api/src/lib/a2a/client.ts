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

function validateAgentUrl(inputUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Block private/internal IP ranges, localhost, and common SSRF bypass forms
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^0$/,                              // decimal 0 == 0.0.0.0
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,                      // link-local / AWS metadata
    /^fc00:/i,                          // IPv6 unique local
    /^fe80:/i,                          // IPv6 link-local
    /^::ffff:127\./,                    // IPv4-mapped loopback
    /^::ffff:10\./,                     // IPv4-mapped private
    /^::ffff:192\.168\./,               // IPv4-mapped private
    /^::ffff:169\.254\./,               // IPv4-mapped metadata
    /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i,    // decimal/hex/octal bare IP
  ];

  if (
    privatePatterns.some(p => p.test(hostname)) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('URL targets a private or internal address');
  }
}

export async function fetchAgentCard(inputUrl: string): Promise<AgentCard> {
  validateAgentUrl(inputUrl);
  const baseUrl = extractBaseUrl(inputUrl);

  // Try /.well-known/agent.json first
  const paths = ['/.well-known/agent.json', '/.well-known/agent-card.json'];

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { redirect: 'error' });
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

  validateAgentUrl(agentUrl);
  const res = await fetch(agentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'error',
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

  validateAgentUrl(agentUrl);
  const res = await fetch(agentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    redirect: 'error',
  });

  if (!res.ok || !res.body) {
    throw new Error(`A2A stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
  } finally {
    reader.cancel().catch(() => {});
  }
}
