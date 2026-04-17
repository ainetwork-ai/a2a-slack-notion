import { z } from 'zod';

// ─── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env['NOTION_API_URL'] ?? 'http://localhost:3001';
const API_KEY = process.env['NOTION_API_KEY'] ?? '';
const API_BASE = `${BASE_URL}/api/v1`;

// ─── HTTP helper ────────────────────────────────────────────────────────────

export async function apiCall(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(10_000),
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

// ─── Tool definitions (20 tools) ────────────────────────────────────────────

export const TOOLS = [
  // ── Existing 15 tools ──
  {
    name: 'ping',
    description: 'Check if the Notion API server is reachable.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'search',
    description: 'Search across pages and blocks in the workspace.',
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
      properties: {
        pageId: { type: 'string', description: 'Filter by page ID (optional)' },
        parentId: { type: 'string', description: 'Filter by parent block ID (optional)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'append_block_children',
    description: "Create a new block under a parent (append to parent's children).",
    inputSchema: {
      type: 'object' as const,
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
    description: "Update a block's properties or content.",
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
      properties: {
        blockId: { type: 'string', description: 'The block ID to comment on' },
        text: { type: 'string', description: 'Comment text' },
        threadId: { type: 'string', description: 'Thread ID for replies (optional)' },
      },
      required: ['blockId', 'text'],
    },
  },
  // ── 5 new tools ──
  {
    name: 'list_workspaces',
    description: 'List all workspaces the user belongs to.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'list_pages',
    description: 'List pages in a workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: { workspace_id: { type: 'string', description: 'Workspace ID' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'get_workspace',
    description: 'Get details of a specific workspace.',
    inputSchema: {
      type: 'object' as const,
      properties: { workspace_id: { type: 'string', description: 'Workspace ID' } },
      required: ['workspace_id'],
    },
  },
  {
    name: 'resolve_comment',
    description: 'Toggle resolve/unresolve a comment thread.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        commentId: { type: 'string', description: 'Comment ID' },
        resolved: { type: 'boolean', description: 'true to resolve, false to unresolve' },
      },
      required: ['commentId', 'resolved'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: { commentId: { type: 'string', description: 'Comment ID' } },
      required: ['commentId'],
    },
  },
];

// ─── Input schemas for validation ───────────────────────────────────────────

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

// New Zod schemas
const ListWorkspacesInput = z.object({});
const ListPagesInput = z.object({ workspace_id: z.string() });
const GetWorkspaceInput = z.object({ workspace_id: z.string() });
const ResolveCommentInput = z.object({ commentId: z.string(), resolved: z.boolean() });
const DeleteCommentInput = z.object({ commentId: z.string() });

// ─── Tool dispatch ──────────────────────────────────────────────────────────

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
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
        result = await apiCall('POST', '/search', {
          query: input.query,
          workspaceId: input.workspace_id,
        });
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

      // ── 5 new tools ──

      case 'list_workspaces': {
        ListWorkspacesInput.parse(args);
        result = await apiCall('GET', '/workspaces');
        break;
      }

      case 'list_pages': {
        const input = ListPagesInput.parse(args);
        result = await apiCall('GET', `/pages?workspace_id=${input.workspace_id}`);
        break;
      }

      case 'get_workspace': {
        const input = GetWorkspaceInput.parse(args);
        result = await apiCall('GET', `/workspaces/${input.workspace_id}`);
        break;
      }

      case 'resolve_comment': {
        const input = ResolveCommentInput.parse(args);
        result = await apiCall('PATCH', `/comments/${input.commentId}/resolve`, {
          resolved: input.resolved,
        });
        break;
      }

      case 'delete_comment': {
        const input = DeleteCommentInput.parse(args);
        result = await apiCall('DELETE', `/comments/${input.commentId}`);
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
}
