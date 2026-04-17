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
    id: 'notion',
    name: 'Notion',
    description: 'Create, read, update, and search Notion pages, blocks, databases, and comments',
    icon: '📝',
    tools: [
      {
        name: 'pages.create',
        description: 'Create a new page in a workspace.',
        parameters: {
          workspaceId: { type: 'string', description: 'Workspace UUID', required: true },
          title: { type: 'string', description: 'Page title; defaults to "Untitled"' },
          parentPageId: { type: 'string', description: 'Optional parent page UUID for nesting' },
          icon: { type: 'string', description: 'Optional emoji or icon string' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'pages.get',
        description: 'Fetch a page and its child block count.',
        parameters: {
          pageId: { type: 'string', description: 'Page UUID', required: true },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'pages.update',
        description: 'Update a page title, icon, cover, or archived flag.',
        parameters: {
          pageId: { type: 'string', description: 'Page UUID', required: true },
          title: { type: 'string', description: 'New title' },
          icon: { type: 'string', description: 'New icon' },
          cover: { type: 'string', description: 'New cover' },
          archived: { type: 'boolean', description: 'Set archived state' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'pages.delete',
        description: 'Soft-delete (archive) a page; pass hard=true to permanently delete.',
        parameters: {
          pageId: { type: 'string', description: 'Page UUID', required: true },
          hard: { type: 'boolean', description: 'Permanently delete when true' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'pages.query',
        description: 'List or search pages within a workspace.',
        parameters: {
          workspaceId: { type: 'string', description: 'Workspace UUID', required: true },
          q: { type: 'string', description: 'Optional title substring filter' },
          limit: { type: 'number', description: 'Max results (default 50, max 200)' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'blocks.append',
        description: 'Append a new block to a page.',
        parameters: {
          pageId: { type: 'string', description: 'Owning page UUID', required: true },
          type: { type: 'string', description: 'Block type (text, heading_1, code, …)', required: true },
          content: { type: 'string', description: 'Block body JSON (stringified object)' },
          properties: { type: 'string', description: 'Block properties JSON (stringified object)' },
          parentId: { type: 'string', description: 'Parent block UUID; defaults to pageId' },
          afterBlockId: { type: 'string', description: 'Insert after this sibling block' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'blocks.get',
        description: 'Fetch a single block by ID.',
        parameters: {
          blockId: { type: 'string', description: 'Block UUID', required: true },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'blocks.update',
        description: 'Update a block: properties, content, childrenOrder, or archived flag.',
        parameters: {
          blockId: { type: 'string', description: 'Block UUID', required: true },
          properties: { type: 'string', description: 'New properties JSON (stringified object)' },
          content: { type: 'string', description: 'New content JSON (stringified object)' },
          childrenOrder: { type: 'string', description: 'New ordered child UUIDs (stringified array)' },
          archived: { type: 'boolean', description: 'Set archived state' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'blocks.delete',
        description: 'Delete a block and its descendants.',
        parameters: {
          blockId: { type: 'string', description: 'Block UUID', required: true },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'databases.query',
        description: 'Query row blocks inside a database block.',
        parameters: {
          databaseBlockId: { type: 'string', description: 'UUID of the database block', required: true },
          limit: { type: 'number', description: 'Max rows (default 50, max 200)' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'databases.addView',
        description: 'Create a new view (table/board/list/calendar/gallery/timeline) for a database.',
        parameters: {
          databaseBlockId: { type: 'string', description: 'UUID of the database block', required: true },
          name: { type: 'string', description: 'View display name', required: true },
          type: { type: 'string', description: 'View type: table|board|list|calendar|gallery|timeline', required: true },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'comments.create',
        description: 'Add a comment to a block.',
        parameters: {
          blockId: { type: 'string', description: 'Block UUID to comment on', required: true },
          content: { type: 'string', description: 'Comment text or JSON content', required: true },
          threadId: { type: 'string', description: 'Optional thread UUID for replies' },
          userId: { type: 'string', description: 'Calling user ID for auth check', required: true },
        },
      },
      {
        name: 'comments.resolve',
        description: 'Mark a comment as resolved.',
        parameters: {
          commentId: { type: 'string', description: 'Comment UUID', required: true },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
      {
        name: 'search',
        description: 'Search a workspace across pages and databases.',
        parameters: {
          workspaceId: { type: 'string', description: 'Workspace UUID to scope the search', required: true },
          q: { type: 'string', description: 'Free-text query', required: true },
          types: { type: 'string', description: 'Comma-separated types to filter: page,database' },
          limit: { type: 'number', description: 'Max results (default 50, max 200)' },
          userId: { type: 'string', description: 'Calling user ID for auth check' },
        },
      },
    ],
  },

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
      {
        name: "canvas_read",
        description: "Read the canvas for a channel",
        parameters: {
          channelId: { type: "string", required: true, description: "Channel ID" },
        },
      },
      {
        name: "canvas_write",
        description: "Update the canvas content for a channel (replaces existing content)",
        parameters: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          title: { type: "string", required: false, description: "New title" },
          content: { type: "string", required: true, description: "Markdown content" },
        },
      },
      {
        name: "canvas_append",
        description: "Append markdown to existing canvas",
        parameters: {
          channelId: { type: "string", required: true, description: "Channel ID" },
          content: { type: "string", required: true, description: "Markdown to append" },
        },
      },
      {
        name: "canvas_update_section",
        description: "Update a named section inside a canvas by canvasId. Creates the section if it does not exist. Use this instead of canvas_write to avoid overwriting other agents' sections.",
        parameters: {
          canvasId: { type: "string", required: true, description: "Canvas ID" },
          section: { type: "string", required: true, description: "Section name: draft | edits | fact-check | final" },
          content: { type: "string", required: true, description: "Markdown body for this section" },
          status: { type: "string", required: false, description: "Section status: pending | running | complete" },
        },
      },
      {
        name: "canvas_read_section",
        description: "Read a named section from a canvas. Returns only that section body, saving tokens vs reading the full canvas.",
        parameters: {
          canvasId: { type: "string", required: true, description: "Canvas ID" },
          section: { type: "string", required: true, description: "Section name to read" },
        },
      },
      {
        name: "canvas_set_status",
        description: "Update the pipeline status of a canvas after completing your stage.",
        parameters: {
          canvasId: { type: "string", required: true, description: "Canvas ID" },
          status: { type: "string", required: true, description: "New status: draft | edited | fact-checked | published" },
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
