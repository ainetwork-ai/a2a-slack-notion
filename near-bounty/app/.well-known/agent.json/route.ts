import { NextResponse } from "next/server";
import { buildAgentCard } from "@/lib/agent-card";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildAgentCard(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
