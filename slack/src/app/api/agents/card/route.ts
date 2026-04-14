import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { fetchAgentCard } from "@/lib/a2a/client";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const card = await fetchAgentCard(url);
    return NextResponse.json(card);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch agent card" }, { status: 502 });
  }
}
