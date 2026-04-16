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
  {
    id: "document",
    name: "Document Parser",
    description: "Convert PDF, DOCX, PPTX to Markdown — parse, search, and extract content",
    icon: "📄",
    tools: [
      {
        name: "convert",
        description: "Convert a document (PDF, DOCX, PPTX) to Markdown with page anchors",
        parameters: {
          url: { type: "string", description: "File URL to convert", required: true },
          page: { type: "number", description: "Extract specific page only" },
          search: { type: "string", description: "Search within the document while converting" },
        },
      },
      {
        name: "metadata",
        description: "Get document metadata — title, page count, sections",
        parameters: {
          url: { type: "string", description: "File URL", required: true },
        },
      },
      {
        name: "search",
        description: "Search for text within a document",
        parameters: {
          url: { type: "string", description: "File URL", required: true },
          query: { type: "string", description: "Search query", required: true },
        },
      },
    ],
  },
  {
    id: "slack",
    name: "Slack Workspace",
    description: "Search messages, read threads, and get channel info from this workspace",
    icon: "💬",
    tools: [
      {
        name: "read_thread",
        description: "Read recent messages from a channel or DM",
        parameters: {
          channelId: { type: "string", description: "Channel ID" },
          conversationId: { type: "string", description: "DM conversation ID" },
          limit: { type: "number", description: "Number of messages (default 10, max 30)" },
        },
      },
      {
        name: "get_context",
        description: "Get messages around a specific message",
        parameters: {
          messageId: { type: "string", description: "Message ID to get context around", required: true },
          before: { type: "number", description: "Messages before (default 5)" },
          after: { type: "number", description: "Messages after (default 5)" },
        },
      },
      {
        name: "search",
        description: "Search messages across the workspace",
        parameters: {
          query: { type: "string", description: "Search query", required: true },
          channelId: { type: "string", description: "Limit to specific channel" },
          limit: { type: "number", description: "Number of results (default 10)" },
        },
      },
      {
        name: "channel_info",
        description: "Get channel details and member list",
        parameters: {
          channelId: { type: "string", description: "Channel ID", required: true },
        },
      },
      {
        name: "memory_read",
        description: "Read agent's stored memories (all or by key)",
        parameters: {
          agentId: { type: "string", description: "Agent ID", required: true },
          key: { type: "string", description: "Specific memory key (optional)" },
        },
      },
      {
        name: "memory_write",
        description: "Store a key-value memory for the agent",
        parameters: {
          agentId: { type: "string", description: "Agent ID", required: true },
          key: { type: "string", description: "Memory key", required: true },
          value: { type: "string", description: "Memory value", required: true },
        },
      },
      {
        name: "memory_delete",
        description: "Delete a stored memory by key",
        parameters: {
          agentId: { type: "string", description: "Agent ID", required: true },
          key: { type: "string", description: "Memory key to delete", required: true },
        },
      },
      {
        name: "agent_create",
        description: "Create a new A2A agent in the workspace",
        parameters: {
          name: { type: "string", description: "Agent name", required: true },
          description: { type: "string", description: "Agent description" },
          systemPrompt: { type: "string", description: "System prompt for the agent" },
          mcpAccess: { type: "string", description: "JSON array of MCP server IDs e.g. [\"news\",\"polymarket\"]" },
          skills: { type: "string", description: "JSON array of skills e.g. [{\"name\":\"...\",\"description\":\"...\",\"instruction\":\"...\"}]" },
          creatorId: { type: "string", description: "ID of the user creating the agent", required: true },
        },
      },
      {
        name: "agent_list",
        description: "List all agents in the workspace",
        parameters: {
          creatorId: { type: "string", description: "Filter by creator ID" },
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
