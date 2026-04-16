import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHonoApp } from '../http.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock a2a to avoid Anthropic SDK calls in auth tests
vi.mock('../a2a.js', () => ({
  handleA2A: vi.fn(async (c) => {
    const authHeader = c.req.header('Authorization');
    const apiKey = process.env['NOTION_API_KEY'] ?? '';
    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.json({ ok: true });
  }),
}));

function makeMcpServer() {
  return new Server({ name: 'test', version: '0.0.1' }, { capabilities: {} });
}

describe('T8: /health endpoint', () => {
  it('GET /health → 200 { status: ok }', async () => {
    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('T9: Agent Card', () => {
  it('GET /.well-known/agent.json → valid agent card', async () => {
    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/.well-known/agent.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('name', 'Notion Writer');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('capabilities');
    expect(body).toHaveProperty('skills');
    expect(Array.isArray(body.skills)).toBe(true);
  });
});

describe('T3: /a2a endpoint auth', () => {
  beforeEach(() => {
    process.env['NOTION_API_KEY'] = 'test-secret';
  });

  it('no Bearer token → 401', async () => {
    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(401);
  });

  it('wrong Bearer token → 401', async () => {
    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('correct NOTION_API_KEY → proceeds (not 401)', async () => {
    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { message: { parts: [{ text: 'hello' }] } } }),
    });
    expect(res.status).not.toBe(401);
  });
});
