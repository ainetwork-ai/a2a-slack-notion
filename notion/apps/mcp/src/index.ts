import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, dispatchTool, apiCall } from './tools.js';
import { startHttpServer } from './http.js';

// DEMO_MODE production guard
if (
  process.env['NODE_ENV'] === 'production' &&
  process.env['MCP_MODE'] === 'all'
) {
  process.stderr.write('WARNING: MCP_MODE=all not recommended in production\n');
}

// ─── Server factory ───────────────────────────────────────────────────────────
// Creates a fresh Server instance per use (required for HTTP stateless mode)

export function createMcpServer() {
  const srv = new Server(
    { name: 'notion-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return dispatchTool(name, args as Record<string, unknown>);
  });

  srv.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'workspace://info',
        name: 'Workspace Info',
        description: 'Basic information about the first workspace.',
        mimeType: 'application/json',
      },
      {
        uri: 'workspace://recent-pages',
        name: 'Recent Pages',
        description: 'Pages recently visited by the authenticated user.',
        mimeType: 'application/json',
      },
    ],
  }));

  srv.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      let data: unknown;
      if (uri === 'workspace://info') {
        data = await apiCall('GET', '/workspaces');
        if (Array.isArray(data) && data.length > 0) data = data[0];
      } else if (uri === 'workspace://recent-pages') {
        data = await apiCall('GET', '/recent');
      } else {
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: `Unknown resource: ${uri}` }) }] };
      }
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ error: message }) }] };
    }
  });

  return srv;
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.env['MCP_MODE'] ?? 'stdio';

  if (mode === 'http') {
    startHttpServer(createMcpServer); // Pass factory, not instance
  } else if (mode === 'all') {
    startHttpServer(createMcpServer);
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    process.stderr.write('Notion MCP server started (stdio + HTTP)\n');
  } else {
    // Default: stdio
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    process.stderr.write('Notion MCP server started\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
