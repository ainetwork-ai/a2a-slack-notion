import { NextRequest, NextResponse } from 'next/server';
import type {
  AgentCard,
  JSONRPCErrorResponse,
  JSONRPCResponse,
  JSONRPCSuccessResponse,
} from '@a2a-js/sdk';
import {
  A2AError,
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
} from '@a2a-js/sdk/server';

import { UNBLOCK_AGENTS, UNBLOCK_AGENT_IDS } from '@/data/agents';
import { UnblockExecutor } from '@/lib/executor';
import { getBaseUrl } from '@/lib/url';

// ─────────────────────────────────────────────────────────────
// Single catch-all route that handles both:
//   GET  /api/agents/{id}/.well-known/agent.json → AgentCard
//   POST /api/agents/{id}                        → JSON-RPC 2.0 (A2A)
//   OPTIONS                                      → CORS preflight
//
// CORS is wide-open (`*`) because these agents are meant to be callable
// from arbitrary origins (other agents, scripts, browsers, curl, …).
// Add auth in a separate slice if/when that becomes a concern.
// ─────────────────────────────────────────────────────────────

const AGENT_CARD_PATH = '.well-known/agent.json';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

function withCors<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ agentId: string; path?: string[] }> },
) {
  const { agentId, path } = await context.params;
  const currentPath = path?.join('/') || '';

  const agent = UNBLOCK_AGENTS[agentId];
  if (!agent) {
    return withCors(
      { error: 'Agent not found', knownAgentIds: UNBLOCK_AGENT_IDS },
      { status: 404 },
    );
  }

  if (currentPath === AGENT_CARD_PATH) {
    const baseUrl = getBaseUrl(request);
    const card: AgentCard = {
      ...agent.card,
      url: `${baseUrl}/api/agents/${agentId}`,
    };
    return withCors(card);
  }

  return withCors({ error: 'Not found' }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agentId: string; path?: string[] }> },
) {
  const { agentId, path } = await context.params;
  const currentPath = path?.join('/') || '';

  // Only the root path on an agent id accepts JSON-RPC calls.
  if (currentPath !== '') {
    return withCors({ error: 'Not found' }, { status: 404 });
  }

  const agent = UNBLOCK_AGENTS[agentId];
  if (!agent) {
    return withCors(
      { error: 'Agent not found', knownAgentIds: UNBLOCK_AGENT_IDS },
      { status: 404 },
    );
  }

  const baseUrl = getBaseUrl(request);
  const card: AgentCard = {
    ...agent.card,
    url: `${baseUrl}/api/agents/${agentId}`,
  };

  const executor = new UnblockExecutor(agent);
  const requestHandler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);
  const transport = new JsonRpcTransportHandler(requestHandler);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const errorResponse: JSONRPCErrorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: request body is not valid JSON' },
    };
    return withCors(errorResponse, { status: 400 });
  }

  try {
    const result = await transport.handle(body);

    const isAsyncIterable = (
      obj: unknown,
    ): obj is AsyncIterable<JSONRPCSuccessResponse> =>
      obj != null && typeof obj === 'object' && Symbol.asyncIterator in obj;

    if (isAsyncIterable(result)) {
      const stream = result as AsyncGenerator<JSONRPCSuccessResponse, void, undefined>;
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of stream) {
              controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
            }
          } catch (streamError: unknown) {
            console.error('SSE streaming error:', streamError);
            const a2aError =
              streamError instanceof A2AError
                ? streamError
                : A2AError.internalError((streamError as Error)?.message || 'Streaming error');
            const errorResponse: JSONRPCErrorResponse = {
              jsonrpc: '2.0',
              id: (body as { id?: number | string | null })?.id ?? null,
              error: a2aError.toJSONRPCError(),
            };
            controller.enqueue('event: error\n');
            controller.enqueue(`data: ${JSON.stringify(errorResponse)}\n\n`);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    return withCors(result as JSONRPCResponse);
  } catch (err: unknown) {
    console.error('POST handler error:', err);
    const a2aError =
      err instanceof A2AError ? err : A2AError.internalError('Processing error');
    const errorResponse: JSONRPCErrorResponse = {
      jsonrpc: '2.0',
      id: (body as { id?: number | string | null })?.id ?? null,
      error: a2aError.toJSONRPCError(),
    };
    return withCors(errorResponse, { status: 500 });
  }
}
