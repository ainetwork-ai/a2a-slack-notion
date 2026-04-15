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

  /**
   * Substitute `^VAR^` placeholders in a pipeline prompt with values the
   * caller supplied in `metadata.variables`. Any placeholder the caller
   * did not provide is replaced with a visible "(제공되지 않음)" marker so
   * the LLM treats it as a missing field rather than a literal token.
   *
   * Keys in `variables` match the placeholder name without the carets —
   * i.e. `{ TODAY_DATE: "2025-11-17" }` replaces `^TODAY_DATE^`.
   */
  private substituteVariables(
    prompt: string,
    variables: Record<string, string> | undefined,
  ): string {
    let out = prompt;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        // Normalize to uppercase to match the Notion convention, but also
        // accept the exact-case key for forgiving behavior on the caller side.
        const upper = key.toUpperCase();
        out = out.replaceAll(`^${upper}^`, String(value));
        if (upper !== key) out = out.replaceAll(`^${key}^`, String(value));
      }
    }
    // Scrub any ^VAR^ the caller didn't provide so the LLM doesn't echo
    // the literal placeholder back into its response.
    out = out.replace(/\^[A-Z_]+\^/g, '(제공되지 않음)');
    return out;
  }

  private buildSystemPrompt(
    skillId: string | undefined,
    variables: Record<string, string> | undefined,
  ): string {
    const base = this.agent.persona;
    if (!skillId) return base;
    const raw = this.agent.skillPrompts[skillId];
    if (!raw) return base;
    const skillPrompt = this.substituteVariables(raw, variables);
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

    // Optional per-call template variables. Each key/value corresponds to
    // a `^KEY^` placeholder in the pipeline prompt (see FOLLOWUPS.md,
    // Slice A). The caller owns knowing which variables a given skill
    // expects — documented in README.md per skill.
    const rawVars = userMessage.metadata?.variables;
    const variables =
      rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)
        ? (Object.fromEntries(
            Object.entries(rawVars as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
              .map(([k, v]) => [k, String(v)]),
          ) as Record<string, string>)
        : undefined;

    const systemPrompt = this.buildSystemPrompt(skillId, variables);

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
