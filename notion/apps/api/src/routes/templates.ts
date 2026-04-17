import { Hono } from 'hono';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import {
  pageTemplates,
  blocks,
} from '../../../../slack/src/lib/db/schema';
import type { AppVariables } from '../types/app.js';

const templates = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

const CreateTemplateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().default('custom'),
  content: z.array(z.record(z.string(), z.unknown())).default([]),
});

const ApplyTemplateQuerySchema = z.object({
  workspace_id: z.string(),
  parent_id: z.string().optional(),
});

// GET /templates?workspace_id=...
templates.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const all = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.workspaceId, workspaceId))
    .orderBy(asc(pageTemplates.category), asc(pageTemplates.createdAt));

  const grouped: Record<string, typeof all> = {};
  for (const t of all) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category]!.push(t);
  }

  return c.json({ templates: all, grouped });
});

// GET /templates/:id
templates.get('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const template = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  return c.json(template);
});

// POST /templates
templates.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const template = await db
    .insert(pageTemplates)
    .values({
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category,
      content: parsed.data.content as unknown[],
      createdBy: user.id,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(template, 201);
});

// DELETE /templates/:id
templates.delete('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const template = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  if (template.createdBy !== user.id) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Only the template creator can delete it' }, 403);
  }

  await db.delete(pageTemplates).where(eq(pageTemplates.id, id));
  return c.json({ object: 'page_template', id, deleted: true });
});

// POST /templates/:id/apply?workspace_id=...&parent_id=...
templates.post('/:id/apply', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const queryParsed = ApplyTemplateQuerySchema.safeParse({
    workspace_id: c.req.query('workspace_id'),
    parent_id: c.req.query('parent_id'),
  });
  if (!queryParsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: queryParsed.error.message }, 400);

  const { workspace_id: workspaceId, parent_id: parentId } = queryParsed.data;

  const template = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  // Create the page block (pageId will be self after create)
  const created = await db
    .insert(blocks)
    .values({
      type: 'page',
      parentId: parentId ?? null,
      pageId: workspaceId, // placeholder, updated below
      workspaceId,
      createdBy: user.id,
      properties: {
        title: template.name,
        icon: template.icon ?? null,
        coverUrl: null,
      },
      content: { templateContent: template.content },
    })
    .returning()
    .then((r) => r[0]!);

  const updated = await db
    .update(blocks)
    .set({ pageId: created.id })
    .where(eq(blocks.id, created.id))
    .returning()
    .then((r) => r[0]!);

  if (parentId) {
    await db.transaction(async (tx) => {
      const parent = await tx
        .select({ childrenOrder: blocks.childrenOrder })
        .from(blocks)
        .where(eq(blocks.id, parentId))
        .limit(1)
        .then((r) => r[0]);
      if (parent) {
        await tx
          .update(blocks)
          .set({ childrenOrder: [...parent.childrenOrder, created.id] })
          .where(eq(blocks.id, parentId));
      }
    });
  }

  return c.json(
    {
      id: updated.id,
      ...(updated.properties as Record<string, unknown>),
      templateContent: template.content,
    },
    201,
  );
});

export { templates };
