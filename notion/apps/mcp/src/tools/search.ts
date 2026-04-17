/**
 * Workspace-wide search tool.
 *
 * Slack REST endpoint:
 *   - GET /api/search/notion?workspaceId&q&types&limit
 *     (NOT YET IMPLEMENTED slack-side — the existing /api/search is chat-only)
 */

import { z } from 'zod';
import { callSlack } from '../http.js';
import type { ToolDescriptor } from './types.js';

const SEARCH_TYPES = ['page', 'database', 'block'] as const;

export const SearchInput = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().min(1),
  types: z.array(z.enum(SEARCH_TYPES)).optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export type SearchInput = z.infer<typeof SearchInput>;

export async function search(input: unknown) {
  const { workspaceId, q, types, limit } = SearchInput.parse(input);
  return callSlack({
    method: 'GET',
    path: '/api/search/notion',
    query: {
      workspaceId,
      q,
      limit,
      types: types?.join(','),
    },
  });
}

export const searchTools: ToolDescriptor[] = [
  {
    name: 'search',
    description:
      'Search a workspace across pages, databases, and individual blocks. Types filter is optional.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID to scope the search.' },
        q: { type: 'string', description: 'Free-text query.' },
        types: {
          type: 'array',
          description: 'Limit to these entity kinds.',
          items: { type: 'string', enum: [...SEARCH_TYPES] },
        },
        limit: { type: 'number', description: 'Max results (default 50, max 200).' },
      },
      required: ['workspaceId', 'q'],
    },
    handler: search,
  },
];
