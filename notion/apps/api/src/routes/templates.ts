import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
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

// GET /templates?workspace_id=... — list templates grouped by category
templates.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const all = await prisma.pageTemplate.findMany({
    where: { workspaceId },
    orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
  });

  // Group by category
  const grouped: Record<string, typeof all> = {};
  for (const t of all) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category]!.push(t);
  }

  return c.json({ templates: all, grouped });
});

// GET /templates/:id — get a single template
templates.get('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const template = await prisma.pageTemplate.findUnique({ where: { id } });
  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  return c.json(template);
});

// POST /templates — create a template
templates.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const template = await prisma.pageTemplate.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? null,
      category: parsed.data.category,
      content: parsed.data.content as unknown as import('../generated/prisma/client.js').Prisma.InputJsonValue,
      createdBy: user.id,
    },
  });

  return c.json(template, 201);
});

// DELETE /templates/:id — delete a template
templates.delete('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const template = await prisma.pageTemplate.findUnique({ where: { id } });
  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  // Only owner can delete
  if (template.createdBy !== user.id) {
    return c.json({ object: 'error', status: 403, code: 'forbidden', message: 'Only the template creator can delete it' }, 403);
  }

  await prisma.pageTemplate.delete({ where: { id } });
  return c.json({ object: 'page_template', id, deleted: true });
});

// POST /templates/:id/apply?workspace_id=...&parent_id=...
// Creates a new page populated with the template's content blocks
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

  const template = await prisma.pageTemplate.findUnique({ where: { id } });
  if (!template) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Template not found' }, 404);

  // Create the page block
  const page = await prisma.block.create({
    data: {
      type: 'page',
      parentId: parentId ?? null,
      pageId: '',
      workspaceId,
      createdBy: user.id,
      properties: {
        title: template.name,
        icon: template.icon ?? null,
        coverUrl: null,
      },
      content: { templateContent: template.content },
    },
  });

  // Set pageId to self
  const updated = await prisma.block.update({
    where: { id: page.id },
    data: { pageId: page.id },
  });

  // Add to parent's childrenOrder if nested
  if (parentId) {
    await prisma.$transaction(async (tx) => {
      const parent = await tx.block.findUnique({
        where: { id: parentId },
        select: { childrenOrder: true },
      });
      if (parent) {
        await tx.block.update({
          where: { id: parentId },
          data: { childrenOrder: [...parent.childrenOrder, page.id] },
        });
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
