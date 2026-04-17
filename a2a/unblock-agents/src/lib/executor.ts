import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@a2a-js/sdk';
import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';

import type { UnblockAgent } from '@/data/agents';
import { callLLM } from './llm';
import { searchForReport } from './search';

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

  /**
   * Today's date in Asia/Seoul (YYYY-MM-DD). Unblock Media's editorial
   * pipeline is KST-native, so we align with the parent backend's
   * convention rather than the deployment region's local time.
   */
  private serverKstDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private buildSystemPrompt(
    skillId: string | undefined,
    variables: Record<string, string> | undefined,
    searchContext?: string,
  ): string {
    const base = this.agent.persona;
    if (!skillId) return base;
    const raw = this.agent.skillPrompts[skillId];
    if (!raw) return base;

    // Auto-inject TODAY_DATE from the server clock if the caller didn't
    // supply one. LLMs tend to "correct" future dates back into their
    // training cutoff (e.g. rewriting 2026-04-16 as 2024-04-16), so we
    // also prepend a non-negotiable note pinning the authoritative date
    // at the top of the system prompt.
    const vars: Record<string, string> = { ...(variables ?? {}) };
    const hasToday = Object.keys(vars).some((k) => k.toUpperCase() === 'TODAY_DATE');
    if (!hasToday) vars.TODAY_DATE = this.serverKstDate();
    const todayValue = vars.TODAY_DATE ?? vars.today_date ?? this.serverKstDate();

    const skillPrompt = this.substituteVariables(raw, vars);
    const authoritativeDate =
      `⚠ CURRENT DATE (authoritative, KST): ${todayValue}\n` +
      `위 날짜는 서버 시계 기준이며 반드시 그대로 사용하세요. ` +
      `학습 데이터 시점으로 "보정"하지 마세요. 이 날짜가 미래처럼 느껴져도 실제 오늘입니다.`;

    // Append Tavily search results as a `<Web Search Results>` block at
    // the end, matching the exact section name the Notion pipeline
    // prompts were written against. Empty context → no block emitted.
    const searchBlock =
      searchContext && searchContext.trim().length > 0
        ? `\n\n<Web Search Results>\n${searchContext}`
        : '';

    return `${base}\n\n${authoritativeDate}\n\n=== CURRENT TASK (skill: ${skillId}) ===\n${skillPrompt}${searchBlock}`;
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

    const debug = userMessage.metadata?.debug === true;

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

    // For the `report` skill only, run a Tavily-backed web search so
    // the LLM grounds its output in real articles/dates instead of
    // hallucinating. Other skills operate on already-provided inputs
    // (market research, drafts, feedback) and don't need new external
    // context — adding a search there would be wasted latency.
    let searchContext = '';
    if (skillId === 'report') {
      // Prefer BASIC_ARTICLE_SOURCE when the caller supplied it (that's
      // the concrete event we're researching); fall back to the user's
      // raw message so callers without a structured source still get a
      // grounded answer.
      const source =
        (variables?.BASIC_ARTICLE_SOURCE ?? variables?.basic_article_source ?? '').trim() ||
        userText.trim();
      if (source) {
        try {
          searchContext = await searchForReport(source);
        } catch (err) {
          console.warn(`[${this.agent.id}] searchForReport failed:`, err);
        }
      }
    }

    const systemPrompt = this.buildSystemPrompt(skillId, variables, searchContext);

    try {
      const responseText = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText || '안녕하세요.' },
      ]);

      const replyMeta: Record<string, unknown> = {};
      if (skillId) replyMeta.skillId = skillId;
      if (debug) replyMeta.systemPrompt = systemPrompt;

      // For confirm skill: analyze response and include structured verdict in metadata.
      // Returns boolean `approved` so workflow loop's `until` check works directly.
      // Rejection = explicit "반려" OR revision requests ("수정하고", "다시 가져", etc.)
      // Approval = "승인" without any revision signals
      if (skillId === 'confirm') {
        const hasReject = /반려/.test(responseText);
        const hasRevisionRequest = /수정하고|수정해서|다시 가져|다시 제출|다듬어서|수정이 필요|수정하면/.test(responseText);
        const hasApprove = /승인/.test(responseText);
        replyMeta.approved = hasApprove && !hasReject && !hasRevisionRequest;
      }

      const reply: Message = {
        kind: 'message',
        messageId: uuidv4(),
        role: 'agent',
        parts: [{ kind: 'text', text: responseText }],
        contextId,
        ...(Object.keys(replyMeta).length > 0 && { metadata: replyMeta }),
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
