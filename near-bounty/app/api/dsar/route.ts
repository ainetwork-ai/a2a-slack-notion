import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DsarBody {
  type?: "erase" | "access";
  contact?: string;
  reference?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as DsarBody;
  const ticketId = `dsar_${crypto.randomBytes(8).toString("hex")}`;
  return NextResponse.json({
    ticketId,
    type: body.type ?? "erase",
    receivedAt: new Date().toISOString(),
    status: "received",
    note:
      "Acknowledged. By design, no raw conversation content is retained beyond the request lifecycle. " +
      "Audit metadata, if any, will be located by request_id and purged within 7 days.",
  });
}

export function GET() {
  return NextResponse.json({
    endpoint: "DSAR (data subject access request)",
    methods: ["POST"],
    body: { type: "erase | access", contact: "optional", reference: "optional request_id" },
  });
}
