import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { inviteAgent, removeAgent, listAgents, healthCheck, getAgentSkills } from '../lib/a2a/agent-manager.js';
import { invokeAgent, invokeAgentStream } from '../lib/a2a/agent-invoker.js';
import { fetchAgentCard } from '../lib/a2a/client.js';
import { prisma } from '../lib/prisma.js';
import type { AppVariables } from '../types/app.js';

async function requireWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership !== null;
}

export const agents = new Hono<{ Variables: AppVariables }>();

// List agents in workspace
agents.get('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ error: 'workspace_id required' }, 400);

  const agentList = await listAgents(workspaceId);
  return c.json(agentList);
});

// Preview agent card (without inviting)
agents.get('/card', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url required' }, 400);

  try {
    const card = await fetchAgentCard(url);
    return c.json(card);
  } catch (error) {
    return c.json({ error: 'Failed to fetch agent card' }, 400);
  }
});

// Agent registry for external agents (strips internal a2aUrl)
agents.get('/registry', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) return c.json({ error: 'workspace_id required' }, 400);

  const agentList = await listAgents(workspaceId);
  return c.json(agentList.map(a => ({
    id: a.id,
    name: a.name,
    status: a.agentStatus,
    skills: (a.agentCardJson as any)?.skills || [],
  })));
});

// Invoke agent (called by mention trigger) — must be before /:agentId
agents.post('/invoke', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const { agentId, prompt, pageId, blockId, workspaceId } = body;
  const useStream = c.req.query('stream') === 'true';

  if (!agentId || !prompt || !pageId || !workspaceId) {
    return c.json({ error: 'agentId, prompt, pageId, and workspaceId required' }, 400);
  }

  if (!(await requireWorkspaceMember(user.id, workspaceId))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (useStream) {
    return streamSSE(c, async (sseStream) => {
      try {
        for await (const chunk of invokeAgentStream({ agentId, prompt, pageId, blockId, workspaceId })) {
          await sseStream.writeSSE({ data: JSON.stringify(chunk) });
        }
        await sseStream.writeSSE({ data: '[DONE]' });
      } catch (error) {
        await sseStream.writeSSE({
          data: JSON.stringify({ type: 'error', content: 'Agent invocation failed' }),
        });
      }
    });
  }

  const result = await invokeAgent({ agentId, prompt, pageId, blockId, workspaceId });
  return c.json(result);
});

// Invite (register) a new agent
agents.post('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const { a2aUrl, workspace_id } = body;

  if (!a2aUrl || !workspace_id) {
    return c.json({ error: 'a2aUrl and workspace_id required' }, 400);
  }

  if (!(await requireWorkspaceMember(user.id, workspace_id))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const agent = await inviteAgent(a2aUrl, workspace_id);
    return c.json(agent, 201);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to invite agent' }, 400);
  }
});

// Get single agent
agents.get('/:agentId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const agentId = c.req.param('agentId');
  const { prisma } = await import('../lib/prisma.js');
  const found = await prisma.user.findUnique({
    where: { id: agentId },
    select: {
      id: true, name: true, image: true, a2aUrl: true,
      agentCardJson: true, agentStatus: true, isAgent: true,
    },
  });
  if (!found || !found.isAgent) return c.json({ error: 'Agent not found' }, 404);
  return c.json(found);
});

// Delete agent
agents.delete('/:agentId', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const agentId = c.req.param('agentId');
  try {
    await removeAgent(agentId);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to remove agent' }, 400);
  }
});

// Health check
agents.post('/:agentId/health', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const agentId = c.req.param('agentId');
  const isOnline = await healthCheck(agentId);
  return c.json({ agentId, status: isOnline ? 'online' : 'offline' });
});

// Get agent skills
agents.get('/:agentId/skills', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const agentId = c.req.param('agentId');
  const skills = await getAgentSkills(agentId);
  return c.json(skills);
});
