/**
 * Comment-level MCP tools.
 *
 * Slack REST endpoints used:
 *   - POST /api/blocks/:id/comments       (comments.create — NOT YET IMPLEMENTED slack-side)
 *   - PATCH /api/comments/:id/resolve     (comments.resolve — NOT YET IMPLEMENTED slack-side)
 *
 * Backed by the `block_comments` table in slack's schema.
 */

import { z } from 'zod';
import { callSlack } from '../http.js';
import type { ToolDescriptor } from './types.js';

// ─── comments.create ─────────────────────────────────────────────────────────
export const CommentsCreateInput = z.object({
  blockId: z.string().uuid(),
  content: z.union([z.string(), z.record(z.unknown())]),
  threadId: z.string().uuid().optional(),
});
export type CommentsCreateInput = z.infer<typeof CommentsCreateInput>;

// ─── comments.resolve ────────────────────────────────────────────────────────
export const CommentsResolveInput = z.object({ commentId: z.string().uuid() });
export type CommentsResolveInput = z.infer<typeof CommentsResolveInput>;

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function commentsCreate(input: unknown) {
  const { blockId, content, threadId } = CommentsCreateInput.parse(input);
  const body = {
    blockId,
    content: typeof content === 'string' ? { text: content } : content,
    ...(threadId ? { threadId } : {}),
  };
  return callSlack({ method: 'POST', path: '/api/comments', body });
}

export async function commentsResolve(input: unknown) {
  const { commentId } = CommentsResolveInput.parse(input);
  return callSlack({ method: 'PATCH', path: `/api/comments/${commentId}`, body: { resolved: true } });
}

// ─── Descriptors ─────────────────────────────────────────────────────────────

export const commentTools: ToolDescriptor[] = [
  {
    name: 'comments.create',
    description:
      'Add a comment to a block. content can be a plain string (wrapped as {text}) or a rich content object. threadId attaches to an existing thread.',
    inputSchema: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'Block UUID to comment on.' },
        content: {
          description: 'Plain text string or rich content object.',
          oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
        },
        threadId: { type: 'string', description: 'Optional thread UUID for replies.' },
      },
      required: ['blockId', 'content'],
    },
    handler: commentsCreate,
  },
  {
    name: 'comments.resolve',
    description: 'Mark a comment (and optionally its thread) as resolved.',
    inputSchema: {
      type: 'object',
      properties: { commentId: { type: 'string', description: 'Comment UUID.' } },
      required: ['commentId'],
    },
    handler: commentsResolve,
  },
];
