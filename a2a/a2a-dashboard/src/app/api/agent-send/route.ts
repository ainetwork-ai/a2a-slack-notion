import { NextRequest, NextResponse } from "next/server";
import { sendA2AMessage } from "@/lib/a2a-client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentUrl, text, contextId, taskId, skillId, variables, debug } = body;

  if (!agentUrl || !text) {
    return NextResponse.json(
      { error: "agentUrl and text are required" },
      { status: 400 }
    );
  }

  try {
    const result = await sendA2AMessage(agentUrl, text, {
      contextId,
      taskId,
      skillId,
      variables,
      debug,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "A2A send failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
