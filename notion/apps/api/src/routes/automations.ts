import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

const automations = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// Trigger schemas
const TriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status_change'),
    config: z.object({
      databaseId: z.string(),
      fromStatus: z.string().optional(),
      toStatus: z.string(),
    }),
  }),
  z.object({
    type: z.literal('item_created'),
    config: z.object({
      databaseId: z.string(),
    }),
  }),
]);

// Action schemas
const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_notification'),
    config: z.object({
      userId: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('update_property'),
    config: z.object({
      propertyId: z.string(),
      value: z.unknown(),
    }),
  }),
]);

const CreateAutomationSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
  trigger: TriggerSchema,
  actions: z.array(ActionSchema).min(1),
});

const UpdateAutomationSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: TriggerSchema.optional(),
  actions: z.array(ActionSchema).optional(),
  active: z.boolean().optional(),
});

// GET /automations?workspace_id=... — list automations for a workspace
automations.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);

  const all = await prisma.automation.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });

  return c.json(all);
});

// POST /automations — create an automation
automations.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = CreateAutomationSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const automation = await prisma.automation.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      trigger: parsed.data.trigger as object,
      actions: parsed.data.actions as object[],
      createdBy: user.id,
    },
  });

  return c.json(automation, 201);
});

// PATCH /automations/:id — update (toggle active, change config)
automations.patch('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = UpdateAutomationSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const existing = await prisma.automation.findUnique({ where: { id } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Automation not found' }, 404);

  const updateData: {
    name?: string;
    trigger?: object;
    actions?: object[];
    active?: boolean;
  } = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.trigger !== undefined) updateData.trigger = parsed.data.trigger as object;
  if (parsed.data.actions !== undefined) updateData.actions = parsed.data.actions as object[];
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

  const updated = await prisma.automation.update({
    where: { id },
    data: updateData,
  });

  return c.json(updated);
});

// DELETE /automations/:id — delete an automation
automations.delete('/:id', async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const { id } = c.req.param();
  const existing = await prisma.automation.findUnique({ where: { id } });
  if (!existing) return c.json({ object: 'error', status: 404, code: 'not_found', message: 'Automation not found' }, 404);

  await prisma.automation.delete({ where: { id } });
  return c.json({ object: 'automation', id, deleted: true });
});

export { automations };
