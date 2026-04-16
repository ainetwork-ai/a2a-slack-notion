import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock for messages.create — accessible via getMockCreate()
const _mockCreate = vi.fn();

// Mock @anthropic-ai/sdk before importing a2a
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: _mockCreate };
  }
  return { default: Anthropic };
});

// Mock dispatchTool
vi.mock('../tools.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools.js')>();
  return {
    ...actual,
    dispatchTool: vi.fn(async () => ({
      content: [{ type: 'text', text: '{"ok":true}' }],
      isError: false,
    })),
  };
});

import { createHonoApp } from '../http.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

function getMockCreate() {
  return _mockCreate;
}

function makeMcpServer() {
  return new Server({ name: 'test', version: '0.0.1' }, { capabilities: {} });
}

async function readSSEEvents(stream: ReadableStream): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: Array<{ event: string; data: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const eventLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (eventLine && dataLine) {
        events.push({
          event: eventLine.slice(7),
          data: JSON.parse(dataLine.slice(6)),
        });
      }
    }
  }
  return events;
}

describe('T2: A2A tool-calling loop', () => {
  beforeEach(() => {
    process.env['NOTION_API_KEY'] = 'test-secret';
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    vi.clearAllMocks();
  });

  it('single tool call happy path → SSE message event with text', async () => {
    getMockCreate().mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done! Page created.' }],
    });

    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ params: { message: { parts: [{ text: 'create a page' }] } } }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readSSEEvents(res.body!);
    const msgEvent = events.find((e) => e.event === 'message');
    expect(msgEvent).toBeDefined();
    expect((msgEvent!.data as any).text).toBe('Done! Page created.');
  });

  it('multi-tool call sequence → completes with final message', async () => {
    getMockCreate()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'ping', input: {} },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'All done!' }],
      });

    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { message: { parts: [{ text: 'ping then done' }] } } }),
    });

    const events = await readSSEEvents(res.body!);
    const toolEvent = events.find((e) => e.event === 'tool_use');
    const msgEvent = events.find((e) => e.event === 'message');
    expect(toolEvent).toBeDefined();
    expect(msgEvent).toBeDefined();
    expect((msgEvent!.data as any).text).toBe('All done!');
  });

  it('tool throws → error event in SSE', async () => {
    const { dispatchTool } = await import('../tools.js');
    vi.mocked(dispatchTool).mockRejectedValueOnce(new Error('Notion API error'));

    getMockCreate().mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu2', name: 'ping', input: {} }],
    });

    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { message: { parts: [{ text: 'fail' }] } } }),
    });

    const events = await readSSEEvents(res.body!);
    const errEvent = events.find((e) => e.event === 'error');
    expect(errEvent).toBeDefined();
  });

  it('11 iterations → exits at max 10, sends error event', async () => {
    // Always return tool_use to force max iterations
    getMockCreate().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu3', name: 'ping', input: {} }],
    });

    const app = createHonoApp(() => makeMcpServer());
    const res = await app.request('/a2a', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: { message: { parts: [{ text: 'loop forever' }] } } }),
    });

    const events = await readSSEEvents(res.body!);
    const errEvent = events.find((e) => e.event === 'error');
    expect(errEvent).toBeDefined();
    expect((errEvent!.data as any).message).toContain('Max iterations');
    // Should not call create more than MAX_ITERATIONS times
    expect(getMockCreate().mock.calls.length).toBeLessThanOrEqual(10);
  });
});
