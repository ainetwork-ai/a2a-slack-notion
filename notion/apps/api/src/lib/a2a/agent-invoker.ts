import { prisma } from '../prisma.js';
import { sendA2AMessage, streamA2AMessage, type AgentCard } from './client.js';
import { createLogger } from '@notion/shared';

const logger = createLogger('agent-invoker');

export async function invokeAgent(params: {
  agentId: string;
  prompt: string;
  pageId: string;
  blockId?: string;
  workspaceId: string;
}) {
  const { agentId, prompt, pageId, blockId, workspaceId } = params;

  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent || !agent.isAgent || !agent.a2aUrl) {
    throw new Error(`Agent not found or invalid: ${agentId}`);
  }

  const card = agent.agentCardJson as unknown as AgentCard | null;
  const rpcUrl = card?.url || agent.a2aUrl;

  // Build context with page info — prompt first so agents see the request immediately
  const contextMessage = `${prompt}\n\n[Document context: pageId=${pageId}${blockId ? `, blockId=${blockId}` : ''}, workspaceId=${workspaceId}]`;

  logger.info({ agentId, agentName: agent.name, pageId }, 'Invoking agent');

  try {
    const response = await sendA2AMessage(rpcUrl, contextMessage, {
      agentName: agent.name,
    });

    logger.info({ agentId, responseKind: response.kind }, 'Agent responded');
    return {
      success: true,
      content: response.content,
      taskId: response.taskId,
      contextId: response.contextId,
      agentName: agent.name,
    };
  } catch (error) {
    logger.error({ agentId, error }, 'Agent invocation failed');
    return {
      success: false,
      content: `Agent ${agent.name} is currently unavailable.`,
      agentName: agent.name,
    };
  }
}

export async function* invokeAgentStream(params: {
  agentId: string;
  prompt: string;
  pageId: string;
  blockId?: string;
  workspaceId: string;
}): AsyncGenerator<{ type: string; content: string }> {
  const { agentId, prompt, pageId, blockId, workspaceId } = params;

  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent || !agent.isAgent || !agent.a2aUrl) {
    yield { type: 'error', content: `Agent not found: ${agentId}` };
    return;
  }

  const card = agent.agentCardJson as unknown as AgentCard | null;
  const rpcUrl = card?.url || agent.a2aUrl;

  const apiBaseUrl = process.env['API_BASE_URL'] || 'http://localhost:3011';
  const registryUrl = `${apiBaseUrl}/api/v1/agents/registry?workspace_id=${workspaceId}`;
  const contextMessage = `${prompt}\n\n[Document context: pageId=${pageId}${blockId ? `, blockId=${blockId}` : ''}, workspaceId=${workspaceId}, agentRegistry=${registryUrl}]`;

  logger.info({ agentId, agentName: agent.name, pageId }, 'Invoking agent (streaming)');

  // Announce which agent is starting
  yield { type: 'agent_start', content: JSON.stringify({ agentId, name: agent.name }) };

  let collectedContent = '';

  try {
    if (card?.capabilities?.streaming) {
      for await (const chunk of streamA2AMessage(rpcUrl, contextMessage, { agentName: agent.name })) {
        if (chunk.content) collectedContent += chunk.content;
        yield chunk;
      }
    } else {
      const response = await sendA2AMessage(rpcUrl, contextMessage, { agentName: agent.name });
      if (response.content) {
        collectedContent = response.content;
        const words = response.content.split(' ');
        for (let i = 0; i < words.length; i++) {
          yield { type: 'text', content: (i === 0 ? '' : ' ') + words[i] };
          await new Promise(r => setTimeout(r, 25));
        }
      }
    }
  } catch (error) {
    logger.error({ agentId, error }, 'Agent stream invocation failed');
    yield { type: 'error', content: `Agent ${agent.name} is currently unavailable.` };
    yield { type: 'agent_end', content: JSON.stringify({ agentId }) };
    return;
  }

  yield { type: 'agent_end', content: JSON.stringify({ agentId }) };

  // Multi-agent chaining: find a review agent in this workspace and invoke it
  if (collectedContent.length > 0) {
    try {
      const allAgents = await prisma.user.findMany({
        where: {
          isAgent: true,
          id: { not: agentId },
          workspaceMembers: { some: { workspaceId } },
        },
      });

      const reviewAgent = allAgents.find(a => {
        const c = a.agentCardJson as unknown as AgentCard | null;
        return c?.skills?.some(s =>
          s.id?.toLowerCase().includes('review') ||
          s.name?.toLowerCase().includes('review') ||
          s.id?.toLowerCase().includes('fact') ||
          s.name?.toLowerCase().includes('fact'),
        );
      });

      if (reviewAgent?.a2aUrl) {
        const reviewCard = reviewAgent.agentCardJson as unknown as AgentCard | null;
        const reviewRpcUrl = reviewCard?.url || reviewAgent.a2aUrl;
        const reviewContext = `[Context: pageId=${pageId}, workspaceId=${workspaceId}]\n\nPlease review and provide feedback on the following content written by ${agent.name}:\n\n${collectedContent}`;

        logger.info({ reviewAgentId: reviewAgent.id, reviewAgentName: reviewAgent.name }, 'Auto-invoking review agent (multi-agent chain)');

        yield { type: 'agent_start', content: JSON.stringify({ agentId: reviewAgent.id, name: reviewAgent.name }) };

        try {
          if (reviewCard?.capabilities?.streaming) {
            for await (const chunk of streamA2AMessage(reviewRpcUrl, reviewContext, { agentName: reviewAgent.name })) {
              yield chunk;
            }
          } else {
            const reviewResponse = await sendA2AMessage(reviewRpcUrl, reviewContext, { agentName: reviewAgent.name });
            if (reviewResponse.content) {
              const words = reviewResponse.content.split(' ');
              for (let i = 0; i < words.length; i++) {
                yield { type: 'text', content: (i === 0 ? '' : ' ') + words[i] };
                await new Promise(r => setTimeout(r, 25));
              }
            }
          }
        } catch (reviewError) {
          logger.error({ reviewAgentId: reviewAgent.id, reviewError }, 'Review agent invocation failed');
        }

        yield { type: 'agent_end', content: JSON.stringify({ agentId: reviewAgent.id }) };
      }
    } catch (chainError) {
      logger.error({ chainError }, 'Multi-agent chain lookup failed');
    }
  }
}

export async function* invokeRevisionStream(
  agentId: string,
  params: {
    originalText: string
    instruction: string
    pageId: string
    workspaceId: string
    commentId: string
  },
): AsyncGenerator<{ type: string; content: string }> {
  const agent = await prisma.user.findFirst({
    where: { id: agentId, isAgent: true },
  })
  if (!agent?.a2aUrl) {
    yield { type: 'error', content: `Agent ${agentId} not found or has no A2A URL` }
    return
  }

  const card = agent.agentCardJson as unknown as AgentCard | null;
  const rpcUrl = card?.url || agent.a2aUrl;

  const revisionPrompt = [
    `다음 텍스트를 아래 지시사항에 따라 첨삭해주세요.`,
    ``,
    `[원본 텍스트]`,
    params.originalText,
    ``,
    `[첨삭 지시사항]`,
    params.instruction,
    ``,
    `[규칙]`,
    `- 첨삭된 텍스트만 출력하세요. 설명이나 부가 문구는 포함하지 마세요.`,
    `- 원본 텍스트의 형식(줄바꿈 등)을 최대한 유지하세요.`,
  ].join('\n')

  yield { type: 'revision_start', content: JSON.stringify({ agentId, commentId: params.commentId }) }

  if (card?.capabilities?.streaming) {
    for await (const chunk of streamA2AMessage(rpcUrl, revisionPrompt, { agentName: agent.name })) {
      yield chunk
    }
  } else {
    const response = await sendA2AMessage(rpcUrl, revisionPrompt, { agentName: agent.name })
    if (response.content) {
      const words = response.content.split(' ')
      for (let i = 0; i < words.length; i++) {
        yield { type: 'text', content: (i === 0 ? '' : ' ') + words[i] }
        await new Promise(r => setTimeout(r, 25))
      }
    }
  }

  yield { type: 'revision_end', content: JSON.stringify({ agentId, commentId: params.commentId }) }
}
