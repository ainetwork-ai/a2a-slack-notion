import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@a2a-js/sdk';
import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';

import type { UnblockAgent } from '@/data/agents';
import { callLLM } from './llm';

// ─────────────────────────────────────────────────────────────
// One executor instance per agent (bound to its persona + skillPrompts).
// Kept deliberately simple: no long-lived history store, no task
// persistence — A2A SDK's DefaultRequestHandler handles the task
// lifecycle, and this executor just produces a single reply message.
//
// Skill routing = "medium depth": if the incoming message carries
// `metadata.skillId` that matches a skillPrompts key, the matching
// pipeline prompt is appended to the persona. Otherwise the agent
// chats as their persona.
// ─────────────────────────────────────────────────────────────

export class UnblockExecutor implements AgentExecutor {
  constructor(private readonly agent: UnblockAgent) {}

  private buildSystemPrompt(skillId?: string): string {
    const base = this.agent.persona;
    if (!skillId) return base;
    const skillPrompt = this.agent.skillPrompts[skillId];
    if (!skillPrompt) return base;
    return `${base}\n\n=== CURRENT TASK (skill: ${skillId}) ===\n${skillPrompt}`;
  }

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const { userMessage, contextId } = requestContext;

    const textPart = userMessage.parts.find((p) => p.kind === 'text');
    const userText = textPart && 'text' in textPart ? textPart.text : '';

    const skillId =
      typeof userMessage.metadata?.skillId === 'string'
        ? userMessage.metadata.skillId
        : undefined;

    const systemPrompt = this.buildSystemPrompt(skillId);

    try {
      const responseText = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText || '안녕하세요.' },
      ]);

      const reply: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [{ kind: 'text', text: responseText }],
        contextId,
        ...(skillId && { metadata: { skillId } }),
      };
      eventBus.publish(reply);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[${this.agent.id}] LLM error:`, msg);
      const reply: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: 'Sorry, I could not process your request. Please check the server logs.',
          },
        ],
        contextId,
      };
      eventBus.publish(reply);
    } finally {
      eventBus.finished();
    }
  }

  async cancelTask(): Promise<void> {
    // No long-running work to cancel — single-shot LLM call.
  }
}
