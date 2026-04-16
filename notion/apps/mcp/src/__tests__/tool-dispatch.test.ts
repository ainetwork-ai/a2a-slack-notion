import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchTool, TOOLS } from '../tools.js';

// Mock fetch globally
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ ok: true }),
  } as Response);
  process.env['NOTION_API_KEY'] = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('T4: Tool dispatch switch', () => {
  it('has 20 tools defined', () => {
    expect(TOOLS).toHaveLength(20);
  });

  it('unknown tool name → isError: true', async () => {
    const result = await dispatchTool('nonexistent_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('Zod validation failure → error caught, isError: true', async () => {
    // get_page requires pageId — passing empty object
    const result = await dispatchTool('get_page', {});
    expect(result.isError).toBe(true);
  });

  const TOOL_NAMES = TOOLS.map((t) => t.name);

  const TOOL_MINIMAL_ARGS: Record<string, Record<string, unknown>> = {
    ping: {},
    search: { query: 'test' },
    get_page: { pageId: 'page1' },
    create_page: { workspace_id: 'ws1' },
    update_page: { pageId: 'page1' },
    delete_page: { pageId: 'page1' },
    get_block_children: {},
    append_block_children: { type: 'text', pageId: 'p1', workspaceId: 'ws1' },
    update_block: { blockId: 'b1' },
    delete_block: { blockId: 'b1' },
    query_database: { databaseId: 'db1' },
    create_database_item: { databaseId: 'db1', properties: {} },
    update_database_item: { databaseId: 'db1', rowId: 'r1', properties: {} },
    get_comments: { blockId: 'b1' },
    add_comment: { blockId: 'b1', text: 'hello' },
    list_workspaces: {},
    list_pages: { workspace_id: 'ws1' },
    get_workspace: { workspace_id: 'ws1' },
    resolve_comment: { commentId: 'c1', resolved: true },
    delete_comment: { commentId: 'c1' },
  };

  for (const toolName of TOOL_NAMES) {
    it(`dispatches ${toolName} without error`, async () => {
      const args = TOOL_MINIMAL_ARGS[toolName] ?? {};
      const result = await dispatchTool(toolName, args);
      // With mocked fetch returning ok:true, should not be an error
      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
    });
  }
});
