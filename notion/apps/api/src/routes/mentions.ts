import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { appEvents } from '../lib/events.js';
import type { AppVariables } from '../types/app.js';
import type { MentionEvent } from '../lib/events.js';

const mentions = new Hono<{ Variables: AppVariables }>();

// GET /mentions/suggest?type=user|page&q=searchterm&workspace_id=xxx
mentions.get('/suggest', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const type = c.req.query('type');
  const q = c.req.query('q') ?? '';
  const workspaceId = c.req.query('workspace_id');

  if (!workspaceId) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'workspace_id required' }, 400);
  }

  if (!type || type === 'all') {
    // No type specified — return all workspace members (users + agents)
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        user: { name: { contains: q, mode: 'insensitive' } },
      },
      include: {
        user: {
          select: { id: true, name: true, image: true, isAgent: true, a2aUrl: true, agentStatus: true },
        },
      },
      take: 10,
    });

    return c.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatar: m.user.image ?? undefined,
        ...(m.user.isAgent && {
          isAgent: true,
          a2aUrl: m.user.a2aUrl,
          agentStatus: m.user.agentStatus,
        }),
      })),
    );
  }

  if (type === 'agent') {
    // Search agents in workspace by name
    const agentUsers = await prisma.user.findMany({
      where: {
        isAgent: true,
        name: { contains: q, mode: 'insensitive' },
        workspaceMembers: { some: { workspaceId } },
      },
      select: { id: true, name: true, image: true, a2aUrl: true, agentStatus: true },
      take: 5,
    });

    const results = agentUsers.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.image ?? undefined,
      isAgent: true,
      a2aUrl: a.a2aUrl,
      agentStatus: a.agentStatus,
    }));

    return c.json(results);
  }

  if (type === 'user') {
    const includeAgents = c.req.query('include_agents') === 'true';

    // Search workspace members by name (ILIKE)
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        user: {
          name: { contains: q, mode: 'insensitive' },
          ...(includeAgents ? {} : { isAgent: false }),
        },
      },
      include: {
        user: {
          select: { id: true, name: true, image: true, isAgent: true, a2aUrl: true, agentStatus: true },
        },
      },
      take: 5,
    });

    const results = members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatar: m.user.image ?? undefined,
      ...(m.user.isAgent && {
        isAgent: true,
        a2aUrl: m.user.a2aUrl,
        agentStatus: m.user.agentStatus,
      }),
    }));

    return c.json(results);
  }

  if (type === 'page') {
    // Search pages by title in workspace
    const pages = await prisma.block.findMany({
      where: {
        workspaceId,
        type: 'page',
        archived: false,
        properties: {
          path: ['title'],
          string_contains: q,
        },
      },
      select: {
        id: true,
        properties: true,
      },
      take: 5,
    });

    const results = pages.map((p) => {
      const props = p.properties as Record<string, unknown>;
      return {
        id: p.id,
        name: (props['title'] as string) ?? 'Untitled',
        icon: (props['icon'] as string | undefined) ?? undefined,
      };
    });

    return c.json(results);
  }

  return c.json([]);
});

// POST /mentions/notify — emit mention.created event
mentions.post('/notify', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const body = await c.req.json() as {
    type: 'user' | 'page' | 'date' | 'agent';
    targetId: string;
    pageId: string;
    blockId: string;
  };

  const { type, targetId, pageId, blockId } = body;
  if (!type || !targetId || !pageId || !blockId) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'type, targetId, pageId, blockId required' },
      400,
    );
  }

  const event: MentionEvent = {
    type,
    targetId,
    pageId,
    blockId,
    mentionedBy: user.id,
  };

  appEvents.emit('mention.created', event);

  return c.json({ ok: true });
});

export { mentions };
