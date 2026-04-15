import { callLLM } from './llm';

// ─────────────────────────────────────────────────────────────
// Web search backed by Tavily, ported 1:1 from unblockmedia-backend's
// `middleware/search.js` + `routes/report.internal.js` research pipeline.
// Same provider, same parameters (topic: 'news', max_results: 10),
// same query-generation prompt, same dedup + top-10 window —
// so the output shape the LLM receives matches production Unblock.
// ─────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const TAVILY_URL = 'https://api.tavily.com/search';

/**
 * Single-query web search. Returns [] if the API key is unset or the
 * request fails — callers should treat an empty result as "no search
 * context available" and proceed without blocking the user response
 * (silent degradation is preferable to a hard failure).
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const resp = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 10,
        topic: 'news', // news-focused results; matches parent project
      }),
    });

    if (!resp.ok) {
      console.warn(`[search] Tavily returned ${resp.status}`);
      return [];
    }

    const data = (await resp.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
    };

    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  } catch (err) {
    console.warn('[search] Tavily error:', err);
    return [];
  }
}

/**
 * Multi-query research for the `report` skill. Mirrors unblock-backend's
 * flow exactly:
 *
 *   1. Ask the LLM for 3 Korean search queries derived from the source
 *   2. Fire all 3 Tavily searches in parallel
 *   3. Dedup by URL across the combined result pool
 *   4. Keep top 10 results
 *   5. Format as markdown link blocks the LLM can quote directly
 *
 * Returns an empty string when there's nothing useful to inject
 * (missing key, failed queries, zero results) so the caller can
 * compose prompts without a conditional branch.
 */
export async function searchForReport(source: string): Promise<string> {
  if (!source || !source.trim()) return '';

  // Step 1: generate 3 queries from the source.
  const queryPrompt =
    `다음 기사 자료를 바탕으로, 이 주제를 더 조사하는 데 도움이 될 구체적인 웹 검색 쿼리 3개를 생성하세요. ` +
    `번호나 추가 텍스트 없이 한 줄에 하나씩 쿼리만 반환하세요.\n\n<자료>\n${source}`;

  let queries: string[] = [];
  try {
    const queryResponse = await callLLM([{ role: 'user', content: queryPrompt }]);
    queries = queryResponse
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch (err) {
    console.warn('[search] query generation failed:', err);
    return '';
  }

  if (queries.length === 0) return '';

  // Step 2: parallel search across queries.
  const allResults = (await Promise.all(queries.map((q) => webSearch(q)))).flat();
  if (allResults.length === 0) return '';

  // Step 3: dedup by URL, keep insertion order.
  const seen = new Set<string>();
  const unique: SearchResult[] = [];
  for (const r of allResults) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
    if (unique.length >= 10) break;
  }

  if (unique.length === 0) return '';

  // Step 4: format as markdown-link blocks. Matches the shape the
  // Notion pipeline prompt was written against — the LLM is primed
  // to quote these links and dates directly in its article.
  return unique.map((r) => `[${r.title}](${r.url})\n${r.snippet}`).join('\n\n');
}
