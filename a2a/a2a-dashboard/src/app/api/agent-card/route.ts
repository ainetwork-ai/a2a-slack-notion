import { NextRequest, NextResponse } from "next/server";
import { fetchAgentCard } from "@/lib/a2a-client";

export async function GET(request: NextRequest) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    const card = await fetchAgentCard(url);
    return NextResponse.json(card);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch agent card";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
