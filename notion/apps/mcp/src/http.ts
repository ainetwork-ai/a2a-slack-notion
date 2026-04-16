import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { handleA2A } from './a2a.js';

const AGENT_CARD = {
  name: 'Notion Writer',
  description: 'Reads and writes Notion pages and blocks via MCP tools',
  version: '0.1.0',
  url: `http://localhost:${process.env['MCP_HTTP_PORT'] ?? 3002}`,
  capabilities: { streaming: true },
  skills: [
    {
      id: 'write_page',
      name: 'Write Page',
      description: 'Creates or updates a Notion page with content',
    },
    {
      id: 'search_docs',
      name: 'Search Documents',
      description: 'Searches across the workspace',
    },
  ],
};

// Takes a factory so each HTTP request gets a fresh Server instance
// (MCP SDK forbids reconnecting the same Server to multiple transports)
export function createHonoApp(serverFactory: () => Server) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/.well-known/agent.json', (c) => c.json(AGENT_CARD));

  app.all('/mcp', async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = serverFactory(); // New Server per request (stateless HTTP mode)
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  app.post('/a2a', (c) => handleA2A(c));

  return app;
}

export function startHttpServer(serverFactory: () => Server) {
  const app = createHonoApp(serverFactory);
  const port = Number(process.env['MCP_HTTP_PORT'] ?? 3002);

  serve({ fetch: app.fetch, port }, () => {
    process.stderr.write(
      `Notion MCP HTTP server listening on port ${port}\n`,
    );
  });
}
