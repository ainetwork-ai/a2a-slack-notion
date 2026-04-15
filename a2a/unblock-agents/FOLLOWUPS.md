# Follow-up slices

Known limitations of the initial release and concrete plans to address them.
This document complements `README.md` — it's not a roadmap in the marketing
sense, it's an engineering memo so whoever picks this up next has the
context.

Each slice is self-contained and independently deployable. Recommended
order is A → B → C.

---

## Slice A — `^VAR^` template substitution (Level 3 depth)

### Problem

The Notion pipeline-stage prompts contain placeholders like `^TODAY_DATE^`,
`^BASIC_ARTICLE_SOURCE^`, `^CHIEF_COMMENT^`, `^REPORTER^`,
`^MARKET_RESEARCH^`, `^ARTICLE_GUIDE^`, `^ARTICLE_DRAFT^`,
`^MANAGER_FEEDBACK^`, `^CORRECTED_ARTICLE^`. In production Unblock Media
these are filled in by upstream stages. Today the executor passes them to
the LLM verbatim, which causes visible leaks:

```
^TODAY_DATE^ 기준으로 최신 정보를 확인한 결과, 다음과 같습니다.
(실시간 웹 검색 결과 요약 및 편집장 지시에 따른 보고서 작성
 - 실제 검색 결과에 따라 내용이 달라짐)
```

Both `^TODAY_DATE^` literal and the meta-commentary show up in output.

### Fix

Accept a `variables` object in message metadata and substitute into the
skill prompt before sending to the LLM.

Caller side:

```json
{
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "리포트 작성해줘" }],
      "metadata": {
        "skillId": "report",
        "variables": {
          "TODAY_DATE": "2025-11-17",
          "BASIC_ARTICLE_SOURCE": "비트코인 현물 ETF 승인 후 ... (실제 원문)",
          "CHIEF_COMMENT": "이번 주 핵심 건으로 다뤄줘"
        }
      }
    }
  }
}
```

Server side (`src/lib/executor.ts` buildSystemPrompt):

```ts
const vars = (userMessage.metadata?.variables ?? {}) as Record<string, string>;
let skillPrompt = this.agent.skillPrompts[skillId];
for (const [k, v] of Object.entries(vars)) {
  skillPrompt = skillPrompt.replaceAll(`^${k}^`, String(v));
}
// Any remaining ^VAR^ (not provided by caller) → explicit placeholder
skillPrompt = skillPrompt.replace(/\^[A-Z_]+\^/g, '(제공되지 않음)');
```

### Cost / risk

- ~30 lines in `executor.ts`, README + URLS.txt curl examples
- No external dependency, no new API key
- Backward compatible: no `variables` → graceful "(제공되지 않음)" fallback,
  pre-existing callers keep working
- Open question: A2A spec has no schema for per-skill parameters, so
  callers need human-readable docs on which variables each skill expects.
  README lists them per skill.

### Expected output after Slice A

```
2025-11-17(현지시각) 코인데스크에 따르면, 비트코인 현물 ETF는 승인 후…
```

No `^VAR^` leaks, no meta-commentary about "실제 검색 결과에 따라 달라짐".

---

## Slice B — web search integration

### Problem

Even after Slice A, REPORT and similar research-heavy stages hallucinate
dates, figures, and quotes:

```
예시: 2024년 5월 15일(현지시각) 코인데스크에 따르면,
블랙록, 피델리티 등 주요 자산운용사들의 ETF가 시장을 주도하고 있으며…
마이클 세일러 회장은 비트코인이 안전자산으로서의 역할을 강화할 것이라고
전망했습니다.
```

The date, the Saylor quote — all made up. The Notion report prompt has
`[중요 지시] 실시간 웹 검색을 수행하십시오`, but the executor provides no
search tool to the LLM, so it falls back to training-data guesswork.

### Fix

Two approaches, ordered by implementation effort:

#### B.1 — out-of-band search + context injection (recommended first)

Before calling the LLM for research-heavy skills (`report`, and
potentially `confirm`), run a search, format results, and prepend them
to the system prompt.

```ts
// src/lib/search.ts — new file
export async function webSearch(query: string) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: 5 }),
  });
  return resp.json() as Promise<{ results: Array<{ title; url; content }> }>;
}

// executor.ts — inside execute() for report skill
if (skillId === 'report' && userText) {
  const { results } = await webSearch(userText);
  const ctx = results
    .map((r) => `[${r.title}](${r.url})\n${r.content}`)
    .join('\n\n');
  systemPrompt += `\n\n=== WEB SEARCH RESULTS ===\n${ctx}`;
}
```

This is precisely the pattern `unblockmedia-backend/routes/report.internal.js`
uses (query generation → search → context build → LLM).

#### B.2 — OpenAI function calling

Expose `webSearch` as a tool so the LLM decides when/what to query. More
flexible (multi-turn search), more complex. Defer unless B.1 proves
insufficient.

### Cost / risk

- ~60 lines `lib/search.ts` + ~30 in `executor.ts` = **~90 lines**
- New env var `TAVILY_API_KEY` (or SerpAPI / Perplexity). Unblock's backend
  already uses Tavily, so the same key can be reused.
- Pricing: Tavily free tier 1,000 requests/month; then ~$20/1k.
- Latency: +1–3 s per search. Total response now 5–15 s — watch the
  Vercel Hobby 10 s function limit; may need Pro, or move search to a
  streaming variant so the header flushes within budget.

### Expected output after Slice A + B

```
2025-11-17(현지시각) Reuters에 따르면, 11월 15일 SEC가 공개한 IBIT 유입액은
$2.3B에 달해 누적 $41B를 돌파했으며… (실제 기사 인용, URL 포함)
```

---

## Slice C — persona suppression / tone balance

### Problem

When a skill is active, the persona still bleeds through conversational
chatter. Max's report response currently opens and closes with:

```
오우 멋진 질문입니다! 🤩 편집장님, 무슨 일이신가요?
…
어때요, 완벽한가요? 😎 궁금한 점이 있으시면 언제든지 말씀해주세요!
```

A market-research report should not open with 🤩 or end with "어때요 완벽한가요?".

### Root cause

`buildSystemPrompt()` concatenates `persona + skillPrompt` as a single
system message. The persona is long and opinionated, and the skill prompt
is shorter — so the LLM gravitates to the persona's habits.

### Fix (approach 1, minimal)

Restructure the system prompt so the skill task is unambiguously dominant
and the persona is demoted to a "tone reference":

```ts
private buildSystemPrompt(skillId?: string): string {
  if (!skillId) return this.agent.persona;
  const skillPrompt = this.agent.skillPrompts[skillId];
  if (!skillPrompt) return this.agent.persona;

  return [
    `당신은 ${this.agent.card.name}이지만, 지금은 특정 업무를 수행 중입니다.`,
    `업무 지시가 최우선이며, 페르소나는 문체 힌트로만 반영하세요.`,
    `과한 이모지, 말버릇, 되묻는 표현은 업무 결과물에 포함하지 마세요.`,
    ``,
    `=== 업무 지시 ===`,
    skillPrompt,
    ``,
    `=== 페르소나 문체 참고 (강요 아님) ===`,
    this.agent.persona,
  ].join('\n');
}
```

### Fix (approach 2, structural)

Split each persona into `{ full, toneOnly }`:

```ts
export const MAX_PERSONA = {
  full: '...',       // what we have today; used for plain chat
  toneOnly: '...',   // stripped-down: endings, tone descriptors only
};
```

Rewrite all 10 `toneOnly` variants — roughly a day of careful editing.

### Cost / risk

- Approach 1: **~15 lines**, one file edit, safe to try & iterate
- Approach 2: ~1 day, 10× persona edits, higher payoff
- Risk: LLM may still ignore priority hints; system prompts have limits.
  Iteration and evals advised.

### Expected output after Slice A + B + C (approach 1)

```
2025-11-17(현지시각) Reuters에 따르면, 비트코인 현물 ETF는…
시장 흐름은 지속적인 기관 유입으로 긍정적으로 유지되고 있다.
```

Still recognizably Max's register (–해요/–하죠 endings) but no chatter
or emoji in a research report.

---

## Priority matrix

| Slice | Fixes                          | Code   | External cost     | Risk    | Visible impact |
| ----- | ------------------------------ | ------ | ----------------- | ------- | -------------- |
| **A** | `^VAR^` literal leaks          | ~30 LoC | none              | low     | ⭐⭐⭐⭐ cleanup |
| **B** | number/fact hallucination      | ~90 LoC | API key, latency  | medium  | ⭐⭐⭐ quality   |
| **C** | tone bleed into skill outputs  | ~15 LoC | none              | medium  | ⭐⭐ subtle     |

Recommended order: **A → B → C**. Doing B before A is wasteful because
real search results would still interleave with literal `^VAR^` leaks.
Doing C before A+B makes voice evaluation noisy (numbers fabricated
under the fixed tone).
