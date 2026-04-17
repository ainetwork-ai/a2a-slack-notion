/**
 * Database-level MCP tools.
 *
 * Slack REST endpoints used:
 *   - POST /api/blocks/:id/query  (databases.query — NOT YET IMPLEMENTED slack-side)
 *   - POST /api/blocks/:id/views  (databases.addView — NOT YET IMPLEMENTED slack-side)
 *
 * Notes: a "database" is a block with type='database'. Rows are child blocks whose
 * `properties` match the database schema. These tools operate on the database block ID.
 */

import { z } from 'zod';
import { callSlack } from '../http.js';
import type { ToolDescriptor } from './types.js';

const VIEW_TYPES = ['table', 'board', 'list', 'calendar', 'gallery', 'timeline'] as const;

// ─── databases.query ─────────────────────────────────────────────────────────
export const DatabasesQueryInput = z.object({
  databaseBlockId: z.string().uuid(),
  filter: z
    .object({
      logic: z.enum(['and', 'or']).optional(),
      conditions: z.array(z.record(z.unknown())).optional(),
    })
    .passthrough()
    .optional(),
  sort: z.array(z.record(z.unknown())).optional(),
  limit: z.number().int().positive().max(200).optional(),
  cursor: z.string().optional(),
});
export type DatabasesQueryInput = z.infer<typeof DatabasesQueryInput>;

// ─── databases.addView ───────────────────────────────────────────────────────
export const DatabasesAddViewInput = z.object({
  databaseBlockId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(VIEW_TYPES),
  filters: z
    .object({
      logic: z.enum(['and', 'or']).default('and'),
      conditions: z.array(z.record(z.unknown())).default([]),
    })
    .optional(),
  sorts: z.array(z.record(z.unknown())).optional(),
  groupBy: z.unknown().optional(),
  config: z
    .object({ visibleProperties: z.array(z.string()).optional() })
    .passthrough()
    .optional(),
});
export type DatabasesAddViewInput = z.infer<typeof DatabasesAddViewInput>;

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function databasesQuery(input: unknown) {
  const { databaseBlockId, ...body } = DatabasesQueryInput.parse(input);
  return callSlack({
    method: 'POST',
    path: `/api/blocks/${databaseBlockId}/query`,
    body,
  });
}

export async function databasesAddView(input: unknown) {
  const { databaseBlockId, ...body } = DatabasesAddViewInput.parse(input);
  return callSlack({
    method: 'POST',
    path: `/api/blocks/${databaseBlockId}/views`,
    body,
  });
}

// ─── Descriptors ─────────────────────────────────────────────────────────────

export const databaseTools: ToolDescriptor[] = [
  {
    name: 'databases.query',
    description:
      'Query row blocks inside a database with an optional filter tree and sort. Returns matching page/row blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseBlockId: {
          type: 'string',
          description: 'UUID of the block with type="database".',
        },
        filter: {
          type: 'object',
          description: 'Filter tree; supports { logic: and|or, conditions: [...] }.',
          additionalProperties: true,
        },
        sort: {
          type: 'array',
          description: 'List of sort descriptors.',
          items: { type: 'object', additionalProperties: true },
        },
        limit: { type: 'number', description: 'Max rows to return (default 50, max 200).' },
        cursor: { type: 'string', description: 'Opaque cursor for pagination.' },
      },
      required: ['databaseBlockId'],
    },
    handler: databasesQuery,
  },
  {
    name: 'databases.addView',
    description: 'Create a new view (table/board/list/calendar/gallery/timeline) for a database block.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseBlockId: {
          type: 'string',
          description: 'UUID of the database block.',
        },
        name: { type: 'string', description: 'Display name for the view.' },
        type: {
          type: 'string',
          enum: [...VIEW_TYPES],
          description: 'View layout type.',
        },
        filters: {
          type: 'object',
          description: 'View-specific filter tree.',
          additionalProperties: true,
        },
        sorts: {
          type: 'array',
          description: 'View-specific sorts.',
          items: { type: 'object', additionalProperties: true },
        },
        groupBy: { description: 'Optional grouping definition (board/list views).' },
        config: {
          type: 'object',
          description: 'Layout config, e.g. { visibleProperties: [...] }.',
          additionalProperties: true,
        },
      },
      required: ['databaseBlockId', 'name', 'type'],
    },
    handler: databasesAddView,
  },
];
