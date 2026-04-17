/**
 * Notion MCP server entrypoint.
 *
 * Exposes 14 tools (5 page, 4 block, 2 database, 2 comment, 1 search) that proxy
 * into the slack workspace REST API. All transport is stdio so the server can be
 * launched by slack's MCP registry like any other provider.
 *
 * Env contract:
 *   SLACK_BASE_URL  — base URL of the slack Next.js app (default: http://localhost:3000)
 *   SLACK_API_KEY   — bearer token sent on every outbound request (optional in dev)
 *
 * Errors from zod validation or the upstream API are surfaced back to the MCP
 * client as `isError: true` tool results so the caller can reason about them
 * without the connection dropping.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { allTools, toolMap } from './tools/index.js';
import { textResult } from './http.js';

const SERVER_NAME = 'notion';
const SERVER_VERSION = '0.1.0';

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap.get(name);

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(args ?? {});
    return textResult(result);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? `Invalid arguments for ${name}: ${JSON.stringify(err.issues)}`
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is the only safe channel — stdout is reserved for the JSON-RPC stream.
  process.stderr.write(
    `Notion MCP server ready (${allTools.length} tools, base=${process.env['SLACK_BASE_URL'] ?? 'http://localhost:3000'})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack ?? err.message : err}\n`);
  process.exit(1);
});
