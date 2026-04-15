import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const BASE_URL = process.env['NOTION_API_URL'] ?? 'http://localhost:3001';
const API_KEY = process.env['NOTION_API_KEY'] ?? '';
const API_BASE = `${BASE_URL}/api/v1`;

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function apiCall(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`API ${method} ${path} failed ${res.status}: ${text}`);
  }

  return data;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ping',
    description: 'Check if the Notion API server is reachable.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search',
    description: 'Search across pages and blocks in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        workspace_id: { type: 'string', description: 'Workspace ID to scope the search' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_page',
    description: 'Retrieve a page by its ID, including its children blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'create_page',
    description: 'Create a new page in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        title: { type: 'string', description: 'Page title' },
        parentId: { type: 'string', description: 'Parent page ID (optional)' },
        icon: { type: 'string', description: 'Page icon emoji (optional)' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'update_page',
    description: 'Update a page title, icon, cover, or archive status.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the page to update' },
        title: { type: 'string', description: 'New title (optional)' },
        icon: { type: 'string', description: 'New icon emoji (optional)' },
        coverUrl: { type: 'string', description: 'New cover image URL (optional)' },
        archived: { type: 'boolean', description: 'Archive or unarchive the page (optional)' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'delete_page',
    description: 'Soft-delete (archive) a page by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'The ID of the page to delete' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'get_block_children',
    description: 'List blocks under a given page or parent block.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Filter by page ID (optional)' },
        parentId: { type: 'string', description: 'Filter by parent block ID (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'append_block_children',
    description: 'Create a new block under a parent (append to parent\'s children).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Block type (e.g. text, heading_1, to_do)' },
        parentId: { type: 'string', description: 'Parent block ID' },
        pageId: { type: 'string', description: 'Page ID this block belongs to' },
        workspaceId: { type: 'string', description: 'Workspace ID' },
        properties: { type: 'object', description: 'Block properties (optional)' },
        content: { type: 'object', description: 'Block rich text content (optional)' },
      },
      required: ['type', 'pageId', 'workspaceId'],
    },
  },
  {
    name: 'update_block',
    description: 'Update a block\'s properties or content.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The ID of the block to update' },
        properties: { type: 'object', description: 'New properties to merge in (optional)' },
        content: { type: 'object', description: 'New content to merge in (optional)' },
      },
      required: ['blockId'],
    },
  },
  {
    name: 'delete_block',
    description: 'Soft-delete (archive) a block by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The ID of the block to delete' },
      },
      required: ['blockId'],
    },
  },
  {
    name: 'query_database',
    description: 'Query rows from a database block.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'The database block ID' },
        filter: { type: 'object', description: 'Filter object (optional)' },
        sorts: { type: 'array', description: 'Sort array (optional)', items: { type: 'object' } },
      },
      required: ['databaseId'],
    },
  },
  {
    name: 'create_database_item',
    description: 'Create a new row in a database.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'The database block ID' },
        properties: { type: 'object', description: 'Row property values' },
      },
      required: ['databaseId', 'properties'],
    },
  },
  {
    name: 'update_database_item',
    description: 'Update a row in a database.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'The database block ID' },
        rowId: { type: 'string', description: 'The row ID' },
        properties: { type: 'object', description: 'Property values to update' },
      },
      required: ['databaseId', 'rowId', 'properties'],
    },
  },
  {
    name: 'get_comments',
    description: 'List comments on a block.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The block ID to fetch comments for' },
      },
      required: ['blockId'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a block.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The block ID to comment on' },
        text: { type: 'string', description: 'Comment text' },
        threadId: { type: 'string', description: 'Thread ID for replies (optional)' },
      },
      required: ['blockId', 'text'],
    },
  },
] as const;

// ─── Input schemas for validation ────────────────────────────────────────────

const PingInput = z.object({});
const SearchInput = z.object({ query: z.string(), workspace_id: z.string().optional() });
const GetPageInput = z.object({ pageId: z.string() });
const CreatePageInput = z.object({
  workspace_id: z.string(),
  title: z.string().optional(),
  parentId: z.string().optional(),
  icon: z.string().optional(),
});
const UpdatePageInput = z.object({
  pageId: z.string(),
  title: z.string().optional(),
  icon: z.string().optional(),
  coverUrl: z.string().optional(),
  archived: z.boolean().optional(),
});
const DeletePageInput = z.object({ pageId: z.string() });
const GetBlockChildrenInput = z.object({
  pageId: z.string().optional(),
  parentId: z.string().optional(),
});
const AppendBlockChildrenInput = z.object({
  type: z.string(),
  parentId: z.string().optional(),
  pageId: z.string(),
  workspaceId: z.string(),
  properties: z.record(z.unknown()).optional(),
  content: z.record(z.unknown()).optional(),
});
const UpdateBlockInput = z.object({
  blockId: z.string(),
  properties: z.record(z.unknown()).optional(),
  content: z.record(z.unknown()).optional(),
});
const DeleteBlockInput = z.object({ blockId: z.string() });
const QueryDatabaseInput = z.object({
  databaseId: z.string(),
  filter: z.record(z.unknown()).optional(),
  sorts: z.array(z.record(z.unknown())).optional(),
});
const CreateDatabaseItemInput = z.object({
  databaseId: z.string(),
  properties: z.record(z.unknown()),
});
const UpdateDatabaseItemInput = z.object({
  databaseId: z.string(),
  rowId: z.string(),
  properties: z.record(z.unknown()),
});
const GetCommentsInput = z.object({ blockId: z.string() });
const AddCommentInput = z.object({
  blockId: z.string(),
  text: z.string(),
  threadId: z.string().optional(),
});

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'notion-mcp', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// ─── List tools ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// ─── Call tool ────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'ping': {
        PingInput.parse(args);
        result = await apiCall('GET', '/ping');
        break;
      }

      case 'search': {
        const input = SearchInput.parse(args);
        const qs = new URLSearchParams({ query: input.query });
        if (input.workspace_id) qs.set('workspace_id', input.workspace_id);
        result = await apiCall('GET', `/search?${qs}`);
        break;
      }

      case 'get_page': {
        const input = GetPageInput.parse(args);
        result = await apiCall('GET', `/pages/${input.pageId}`);
        break;
      }

      case 'create_page': {
        const input = CreatePageInput.parse(args);
        const qs = new URLSearchParams({ workspace_id: input.workspace_id });
        result = await apiCall('POST', `/pages?${qs}`, {
          title: input.title,
          parentId: input.parentId,
          icon: input.icon,
        });
        break;
      }

      case 'update_page': {
        const input = UpdatePageInput.parse(args);
        const { pageId, ...body } = input;
        result = await apiCall('PATCH', `/pages/${pageId}`, body);
        break;
      }

      case 'delete_page': {
        const input = DeletePageInput.parse(args);
        result = await apiCall('DELETE', `/pages/${input.pageId}`);
        break;
      }

      case 'get_block_children': {
        const input = GetBlockChildrenInput.parse(args);
        const qs = new URLSearchParams();
        if (input.pageId) qs.set('pageId', input.pageId);
        if (input.parentId) qs.set('parentId', input.parentId);
        result = await apiCall('GET', `/blocks?${qs}`);
        break;
      }

      case 'append_block_children': {
        const input = AppendBlockChildrenInput.parse(args);
        result = await apiCall('POST', '/blocks', input);
        break;
      }

      case 'update_block': {
        const input = UpdateBlockInput.parse(args);
        const { blockId, ...body } = input;
        result = await apiCall('PATCH', `/blocks/${blockId}`, body);
        break;
      }

      case 'delete_block': {
        const input = DeleteBlockInput.parse(args);
        result = await apiCall('DELETE', `/blocks/${input.blockId}`);
        break;
      }

      case 'query_database': {
        const input = QueryDatabaseInput.parse(args);
        const qs = new URLSearchParams();
        if (input.filter) qs.set('filter', JSON.stringify(input.filter));
        if (input.sorts) qs.set('sorts', JSON.stringify(input.sorts));
        result = await apiCall('GET', `/databases/${input.databaseId}/rows?${qs}`);
        break;
      }

      case 'create_database_item': {
        const input = CreateDatabaseItemInput.parse(args);
        result = await apiCall('POST', `/databases/${input.databaseId}/rows`, {
          properties: input.properties,
        });
        break;
      }

      case 'update_database_item': {
        const input = UpdateDatabaseItemInput.parse(args);
        result = await apiCall('PATCH', `/databases/${input.databaseId}/rows/${input.rowId}`, {
          properties: input.properties,
        });
        break;
      }

      case 'get_comments': {
        const input = GetCommentsInput.parse(args);
        result = await apiCall('GET', `/comments?block_id=${input.blockId}`);
        break;
      }

      case 'add_comment': {
        const input = AddCommentInput.parse(args);
        result = await apiCall('POST', '/comments', {
          blockId: input.blockId,
          content: { text: input.text },
          threadId: input.threadId,
        });
        break;
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Resources ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'workspace://info',
      name: 'Workspace Info',
      description: 'Basic information about the first workspace the authenticated user belongs to.',
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

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let data: unknown;

    if (uri === 'workspace://info') {
      data = await apiCall('GET', '/workspaces');
      // Return the first workspace if it's an array
      if (Array.isArray(data) && data.length > 0) {
        data = data[0];
      }
    } else if (uri === 'workspace://recent-pages') {
      data = await apiCall('GET', '/recent');
    } else {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Unknown resource: ${uri}` }),
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: message }),
        },
      ],
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio — stderr for diagnostics
  process.stderr.write('Notion MCP server started\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
