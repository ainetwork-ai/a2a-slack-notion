import { prisma } from '../prisma.js';
import { fetchAgentCard, type AgentCard } from './client.js';

export async function inviteAgent(a2aUrl: string, workspaceId: string) {
  const card = await fetchAgentCard(a2aUrl);

  // Check if agent already exists
  const existing = await prisma.user.findFirst({
    where: { a2aUrl },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        agentCardJson: card as any,
        agentStatus: 'online',
      },
    });
    // Ensure workspace membership
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: existing.id } },
      update: {},
      create: { workspaceId, userId: existing.id, role: 'member' },
    });
    return existing;
  }

  // Create new agent user with synthetic wallet address
  const walletAddress = `agent-${card.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

  const agent = await prisma.user.create({
    data: {
      walletAddress,
      name: card.name,
      image: card.iconUrl || null,
      isAgent: true,
      a2aUrl,
      agentCardJson: card as any,
      agentStatus: 'online',
    },
  });

  // Add to workspace
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: agent.id, role: 'member' },
  });

  return agent;
}

export async function removeAgent(agentId: string) {
  // Delete workspace memberships first, then user
  await prisma.workspaceMember.deleteMany({ where: { userId: agentId } });
  await prisma.user.delete({ where: { id: agentId } });
}

export async function getAgentSkills(agentId: string) {
  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent?.agentCardJson) return [];
  const card = agent.agentCardJson as unknown as AgentCard;
  return card.skills || [];
}

export async function healthCheck(agentId: string): Promise<boolean> {
  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent?.a2aUrl) return false;

  try {
    const card = await fetchAgentCard(agent.a2aUrl);
    await prisma.user.update({
      where: { id: agentId },
      data: {
        agentCardJson: card as any,
        agentStatus: 'online',
      },
    });
    return true;
  } catch {
    await prisma.user.update({
      where: { id: agentId },
      data: { agentStatus: 'offline' },
    });
    return false;
  }
}

export async function listAgents(workspaceId: string) {
  return prisma.user.findMany({
    where: {
      isAgent: true,
      workspaceMembers: { some: { workspaceId } },
    },
    select: {
      id: true,
      name: true,
      image: true,
      a2aUrl: true,
      agentCardJson: true,
      agentStatus: true,
    },
  });
}
