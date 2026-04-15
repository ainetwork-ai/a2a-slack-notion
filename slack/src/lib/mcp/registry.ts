export interface McpTool {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools: McpTool[];
}

export const MCP_SERVERS: McpServer[] = [
  {
    id: "polymarket",
    name: "Polymarket",
    description: "Prediction market data — trending markets, search, and odds",
    icon: "📊",
    tools: [
      {
        name: "trending",
        description: "Get trending prediction markets by volume",
        parameters: {
          limit: { type: "number", description: "Number of results (default 5)" },
        },
      },
      {
        name: "search",
        description: "Search prediction markets by keyword",
        parameters: {
          query: { type: "string", description: "Search query", required: true },
          limit: { type: "number", description: "Number of results (default 5)" },
        },
      },
      {
        name: "market",
        description: "Get details for a specific market",
        parameters: {
          id: { type: "string", description: "Market condition ID", required: true },
        },
      },
    ],
  },
  {
    id: "news",
    name: "News Search",
    description: "Search news articles and trending topics via Google News",
    icon: "📰",
    tools: [
      {
        name: "search",
        description: "Search news articles by keyword",
        parameters: {
          query: { type: "string", description: "Search query", required: true },
          limit: { type: "number", description: "Number of results (default 5)" },
        },
      },
      {
        name: "trending",
        description: "Get trending news topics",
        parameters: {
          geo: { type: "string", description: "Country code e.g. US, KR (default US)" },
          limit: { type: "number", description: "Number of results (default 5)" },
        },
      },
      {
        name: "topic",
        description: "Get news for a specific topic category",
        parameters: {
          topic: {
            type: "string",
            description: "Topic: world, nation, business, technology, science, sports, health, entertainment",
            required: true,
          },
          limit: { type: "number", description: "Number of results (default 5)" },
        },
      },
    ],
  },
];

export function getServer(serverId: string): McpServer | undefined {
  return MCP_SERVERS.find((s) => s.id === serverId);
}

export function getTool(serverId: string, toolName: string): McpTool | undefined {
  const server = getServer(serverId);
  return server?.tools.find((t) => t.name === toolName);
}
