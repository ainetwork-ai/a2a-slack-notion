import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import { streamA2AMessage } from "@/lib/a2a/client";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const text = searchParams.get("text");
  const skillId = searchParams.get("skillId") || undefined;

  if (!agentId || !text) {
    return new Response(JSON.stringify({ error: "agentId and text are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fetch agent from DB
        const agentRes = await fetch(
          new URL(`/api/agents/${agentId}`, request.url).toString(),
          { headers: request.headers }
        );

        if (!agentRes.ok) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Agent not found" })}\n\n`)
          );
          controller.close();
          return;
        }

        const agent = await agentRes.json();

        if (!agent.a2aUrl) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Agent has no A2A URL" })}\n\n`)
          );
          controller.close();
          return;
        }

        for await (const event of streamA2AMessage(agent.a2aUrl, text, {
          agentName: agent.displayName,
          skillId,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
