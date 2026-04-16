import { NextRequest, NextResponse } from 'next/server';
import { searchForReport, webSearch } from '@/lib/search';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/search
 *
 * Runs Tavily-backed web search so the dashboard can preview what
 * context the report skill would inject into the system prompt.
 *
 * Body: { "source": "article text...", "mode": "report" | "single" }
 *   - mode="report" (default): 3-query research pipeline via LLM
 *   - mode="single": raw single-query search (source used as query)
 *
 * Returns: { "results": "formatted markdown string", "ok": true }
 */
export async function POST(request: NextRequest) {
  let body: { source?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const source = typeof body.source === 'string' ? body.source.trim() : '';
  if (!source) {
    return NextResponse.json(
      { error: 'source is required' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const mode = body.mode ?? 'report';

  try {
    if (mode === 'single') {
      const items = await webSearch(source);
      const formatted = items
        .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
        .join('\n\n');
      return NextResponse.json(
        { ok: true, results: formatted, items, count: items.length },
        { headers: CORS_HEADERS },
      );
    }

    // Default: full report pipeline (LLM query generation + 3× Tavily)
    const results = await searchForReport(source);
    return NextResponse.json(
      { ok: true, results, count: results ? results.split('\n\n').length : 0 },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
