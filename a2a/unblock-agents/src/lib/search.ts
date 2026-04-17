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
export async function webSearch(
  query: string,
  timeRange?: string,
): Promise<{ results: SearchResult[]; timeRange?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { results: [] };

  try {
    const payload: Record<string, unknown> = {
      api_key: apiKey,
      query,
      max_results: 10,
      topic: 'news', // news-focused results; matches parent project
    };
    if (timeRange) {
      payload.time_range = timeRange;
    }

    const resp = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.warn(`[search] Tavily returned ${resp.status}`);
      return { results: [] };
    }

    const data = (await resp.json()) as {
      results?: Array<{ title: string; url: string; content: string }>;
    };

    const results = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
    return { results, timeRange: results.length > 0 ? timeRange : undefined };
  } catch (err) {
    console.warn('[search] Tavily error:', err);
    return { results: [] };
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
    `Based on the following article source, generate 3 specific web search queries that would help investigate this topic further. ` +
    `Return only the queries, one per line, without numbering or additional text.\n\n<Source>\n${source}`;

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

  // Step 2: parallel search across queries with progressive time-range
  // fallback: day → week → month → no filter. For each query, use the
  // first timeRange that returns results.
  const TIME_RANGES: Array<string | undefined> = ['day', 'week', 'month', undefined];
  const TIME_RANGE_LABELS: Record<string, string> = {
    day: 'within last 24 hours',
    week: 'within last week',
    month: 'within last month',
  };
  const NO_RANGE_LABEL = 'date unknown';

  interface TaggedResult extends SearchResult {
    timeRangeLabel: string;
  }

  async function searchWithFallback(query: string): Promise<TaggedResult[]> {
    for (const tr of TIME_RANGES) {
      const { results } = await webSearch(query, tr);
      if (results.length > 0) {
        const label = tr ? TIME_RANGE_LABELS[tr] : NO_RANGE_LABEL;
        return results.map((r) => ({ ...r, timeRangeLabel: label }));
      }
    }
    return [];
  }

  const allResults: TaggedResult[] = (
    await Promise.all(queries.map((q) => searchWithFallback(q)))
  ).flat();
  if (allResults.length === 0) return '';

  // Step 3: dedup by URL, keep insertion order.
  const seen = new Set<string>();
  const unique: TaggedResult[] = [];
  for (const r of allResults) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
    if (unique.length >= 10) break;
  }

  if (unique.length === 0) return '';

  // Step 4: format as markdown-link blocks. Each result is tagged with
  // the time range it came from so the LLM can cite dates accurately.
  return unique
    .map((r) => `[${r.title}](${r.url}) (${r.timeRangeLabel})\n${r.snippet}`)
    .join('\n\n');
}
