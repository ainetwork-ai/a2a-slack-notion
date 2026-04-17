import { NextRequest, NextResponse } from "next/server";
import { buildSealedWitnessCard, originFromRequest } from "@/lib/sealed-witness/agent-card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const origin = originFromRequest(req);
  const card = buildSealedWitnessCard(origin);
  return NextResponse.json(card, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
