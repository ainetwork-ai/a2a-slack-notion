/**
 * Page-level MCP tools.
 *
 * Slack REST endpoints used:
 *   - POST   /api/pages                 (pages.create)
 *   - GET    /api/pages/:id             (pages.get)
 *   - PATCH  /api/pages/:id             (pages.update)
 *   - DELETE /api/pages/:id[?hard=1]    (pages.delete — soft by default)
 *   - GET    /api/pages?workspaceId&q&… (pages.query — NOT YET IMPLEMENTED slack-side)
 */

import { z } from 'zod';
import { callSlack } from '../http.js';
import type { ToolDescriptor } from './types.js';

// ─── pages.create ────────────────────────────────────────────────────────────
export const PagesCreateInput = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().optional(),
  parentPageId: z.string().uuid().optional(),
  icon: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
});
export type PagesCreateInput = z.infer<typeof PagesCreateInput>;

// ─── pages.get ───────────────────────────────────────────────────────────────
export const PagesGetInput = z.object({ pageId: z.string().uuid() });
export type PagesGetInput = z.infer<typeof PagesGetInput>;

// ─── pages.update ────────────────────────────────────────────────────────────
export const PagesUpdateInput = z.object({
  pageId: z.string().uuid(),
  title: z.string().optional(),
  icon: z.string().optional(),
  cover: z.string().optional(),
  archived: z.boolean().optional(),
});
export type PagesUpdateInput = z.infer<typeof PagesUpdateInput>;

// ─── pages.delete ────────────────────────────────────────────────────────────
export const PagesDeleteInput = z.object({
  pageId: z.string().uuid(),
  hard: z.boolean().optional(),
});
export type PagesDeleteInput = z.infer<typeof PagesDeleteInput>;

// ─── pages.query ─────────────────────────────────────────────────────────────
export const PagesQueryInput = z.object({
  workspaceId: z.string().uuid(),
  q: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
  cursor: z.string().optional(),
});
export type PagesQueryInput = z.infer<typeof PagesQueryInput>;

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function pagesCreate(input: unknown) {
  const i = PagesCreateInput.parse(input);
  return callSlack({ method: 'POST', path: '/api/pages', body: i });
}

export async function pagesGet(input: unknown) {
  const { pageId } = PagesGetInput.parse(input);
  return callSlack({ method: 'GET', path: `/api/pages/${pageId}` });
}

export async function pagesUpdate(input: unknown) {
  const { pageId, ...rest } = PagesUpdateInput.parse(input);
  return callSlack({ method: 'PATCH', path: `/api/pages/${pageId}`, body: rest });
}

export async function pagesDelete(input: unknown) {
  const { pageId, hard } = PagesDeleteInput.parse(input);
  return callSlack({
    method: 'DELETE',
    path: `/api/pages/${pageId}`,
    query: hard ? { hard: 1 } : undefined,
  });
}

export async function pagesQuery(input: unknown) {
  const { workspaceId, q, limit, cursor } = PagesQueryInput.parse(input);
  return callSlack({
    method: 'GET',
    path: '/api/pages',
    query: { workspaceId, q, limit, cursor },
  });
}

// ─── Descriptors (exported for the central registry) ─────────────────────────

export const pageTools: ToolDescriptor[] = [
  {
    name: 'pages.create',
    description: 'Create a new page (root block of type=page) in a workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID that owns the page.' },
        title: { type: 'string', description: 'Page title; defaults to "Untitled".' },
        parentPageId: { type: 'string', description: 'Optional parent page for nesting.' },
        icon: { type: 'string', description: 'Optional emoji or icon string.' },
        properties: {
          type: 'object',
          description: 'Extra page properties merged into the root block.',
          additionalProperties: true,
        },
      },
      required: ['workspaceId'],
    },
    handler: pagesCreate,
  },
  {
    name: 'pages.get',
    description: 'Fetch a page and all its child blocks.',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string', description: 'Page UUID.' } },
      required: ['pageId'],
    },
    handler: pagesGet,
  },
  {
    name: 'pages.update',
    description: 'Update a page title, icon, cover, or archived flag.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page UUID.' },
        title: { type: 'string' },
        icon: { type: 'string' },
        cover: { type: 'string' },
        archived: { type: 'boolean' },
      },
      required: ['pageId'],
    },
    handler: pagesUpdate,
  },
  {
    name: 'pages.delete',
    description: 'Soft-delete (archive) a page; pass hard=true to cascade-delete the subtree.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page UUID.' },
        hard: {
          type: 'boolean',
          description: 'When true, permanently deletes the page and its children.',
        },
      },
      required: ['pageId'],
    },
    handler: pagesDelete,
  },
  {
    name: 'pages.query',
    description: 'List or search pages within a workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace UUID to scope the query.' },
        q: { type: 'string', description: 'Optional substring filter on page title.' },
        limit: { type: 'number', description: 'Max results per page (default 50, max 200).' },
        cursor: { type: 'string', description: 'Opaque cursor from a previous response.' },
      },
      required: ['workspaceId'],
    },
    handler: pagesQuery,
  },
];
