import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agent-search
 * Proxy to unblock-agents /api/search endpoint (Tavily web search).
 * Body: { baseUrl, source, mode? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { baseUrl, source, mode } = body as {
    baseUrl?: string;
    source?: string;
    mode?: string;
  };

  if (!baseUrl || !source) {
    return NextResponse.json(
      { error: "baseUrl and source are required" },
      { status: 400 }
    );
  }

  const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/search`;

  try {
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, mode: mode ?? "report" }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Search API returned ${res.status}` },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
