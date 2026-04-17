/**
 * Thin HTTP client that proxies MCP tool calls to the Slack workspace REST API.
 *
 * Contract:
 *   - Base URL: env SLACK_BASE_URL (default http://localhost:3000)
 *   - Auth: env SLACK_API_KEY sent as `Authorization: Bearer …` when present
 *   - All calls return parsed JSON (or raw text if the response is not JSON)
 *   - Non-2xx responses throw with status + body, letting the tool handler
 *     surface a clean error back to the MCP client
 */

const DEFAULT_BASE = 'http://localhost:3000';

export function baseUrl(): string {
  return process.env['SLACK_BASE_URL'] ?? DEFAULT_BASE;
}

export function apiKey(): string | undefined {
  const key = process.env['SLACK_API_KEY'];
  return key && key.length > 0 ? key : undefined;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface CallOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function callSlack<T = unknown>(opts: CallOptions): Promise<T> {
  const { method, path, body, query } = opts;

  let url = `${baseUrl()}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += (path.includes('?') ? '&' : '?') + s;
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = apiKey();
  if (key) headers['authorization'] = `Bearer ${key}`;

  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = raw.length === 0 ? null : JSON.parse(raw);
  } catch {
    parsed = raw;
  }

  if (!res.ok) {
    const snippet = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    throw new Error(`Slack API ${method} ${path} → ${res.status}: ${snippet}`);
  }

  return parsed as T;
}

/** Wrap a result in an MCP CallToolResult text payload. */
export function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}
