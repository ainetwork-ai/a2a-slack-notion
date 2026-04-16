import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { MCP_SERVERS } from "@/lib/mcp/registry";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  return NextResponse.json(MCP_SERVERS);
}
