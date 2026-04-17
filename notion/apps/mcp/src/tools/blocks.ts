/**
 * Block-level MCP tools.
 *
 * Slack REST endpoints used:
 *   - POST   /api/pages/:id/blocks   (blocks.append)
 *   - GET    /api/blocks/:id         (blocks.get)
 *   - PATCH  /api/blocks/:id         (blocks.update)
 *   - DELETE /api/blocks/:id         (blocks.delete)
 */

import { z } from 'zod';
import { callSlack } from '../http.js';
import type { ToolDescriptor } from './types.js';

const BLOCK_TYPES = [
  'page', 'text', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'callout',
  'code', 'divider', 'image', 'quote', 'table', 'bookmark',
  'file', 'embed', 'database',
] as const;

// ─── blocks.append ───────────────────────────────────────────────────────────
export const BlocksAppendInput = z.object({
  pageId: z.string().uuid(),
  type: z.enum(BLOCK_TYPES),
  content: z.record(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
  parentId: z.string().uuid().optional(),
  afterBlockId: z.string().uuid().optional(),
});
export type BlocksAppendInput = z.infer<typeof BlocksAppendInput>;

// ─── blocks.get ──────────────────────────────────────────────────────────────
export const BlocksGetInput = z.object({ blockId: z.string().uuid() });
export type BlocksGetInput = z.infer<typeof BlocksGetInput>;

// ─── blocks.update ───────────────────────────────────────────────────────────
export const BlocksUpdateInput = z.object({
  blockId: z.string().uuid(),
  properties: z.record(z.unknown()).optional(),
  content: z.record(z.unknown()).optional(),
  childrenOrder: z.array(z.string().uuid()).optional(),
  archived: z.boolean().optional(),
});
export type BlocksUpdateInput = z.infer<typeof BlocksUpdateInput>;

// ─── blocks.delete ───────────────────────────────────────────────────────────
export const BlocksDeleteInput = z.object({ blockId: z.string().uuid() });
export type BlocksDeleteInput = z.infer<typeof BlocksDeleteInput>;

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function blocksAppend(input: unknown) {
  const { pageId, ...body } = BlocksAppendInput.parse(input);
  return callSlack({ method: 'POST', path: `/api/pages/${pageId}/blocks`, body });
}

export async function blocksGet(input: unknown) {
  const { blockId } = BlocksGetInput.parse(input);
  return callSlack({ method: 'GET', path: `/api/blocks/${blockId}` });
}

export async function blocksUpdate(input: unknown) {
  const { blockId, ...body } = BlocksUpdateInput.parse(input);
  return callSlack({ method: 'PATCH', path: `/api/blocks/${blockId}`, body });
}

export async function blocksDelete(input: unknown) {
  const { blockId } = BlocksDeleteInput.parse(input);
  return callSlack({ method: 'DELETE', path: `/api/blocks/${blockId}` });
}

// ─── Descriptors ─────────────────────────────────────────────────────────────

export const blockTools: ToolDescriptor[] = [
  {
    name: 'blocks.append',
    description:
      'Append a new block to a page. parentId defaults to pageId (top-level); afterBlockId inserts after a specific sibling.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Owning page UUID.' },
        type: {
          type: 'string',
          enum: [...BLOCK_TYPES],
          description: 'Block type (text, heading_1, code, to_do, database, …).',
        },
        content: {
          type: 'object',
          description: 'Rich text / block body JSON.',
          additionalProperties: true,
        },
        properties: {
          type: 'object',
          description: 'Block-type-specific properties.',
          additionalProperties: true,
        },
        parentId: { type: 'string', description: 'Parent block UUID; defaults to pageId.' },
        afterBlockId: {
          type: 'string',
          description: 'Insert after this sibling; omit to append at end.',
        },
      },
      required: ['pageId', 'type'],
    },
    handler: blocksAppend,
  },
  {
    name: 'blocks.get',
    description: 'Fetch a single block by ID.',
    inputSchema: {
      type: 'object',
      properties: { blockId: { type: 'string', description: 'Block UUID.' } },
      required: ['blockId'],
    },
    handler: blocksGet,
  },
  {
    name: 'blocks.update',
    description:
      'Update a block: properties, content, childrenOrder, or archived flag. All fields are optional patches.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'Block UUID.' },
        properties: { type: 'object', additionalProperties: true },
        content: { type: 'object', additionalProperties: true },
        childrenOrder: {
          type: 'array',
          items: { type: 'string' },
          description: 'New ordered list of child block UUIDs.',
        },
        archived: { type: 'boolean' },
      },
      required: ['blockId'],
    },
    handler: blocksUpdate,
  },
  {
    name: 'blocks.delete',
    description: 'Delete a block and its descendants (cascade via FK).',
    inputSchema: {
      type: 'object',
      properties: { blockId: { type: 'string', description: 'Block UUID.' } },
      required: ['blockId'],
    },
    handler: blocksDelete,
  },
];
