import { NextRequest } from "next/server";
import { streamAgentResponse } from "@/lib/a2a/message-bridge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  const text = searchParams.get("text");
  const skillId = searchParams.get("skillId") || undefined;
  const channelId = searchParams.get("channelId") || undefined;
  const conversationId = searchParams.get("conversationId") || undefined;
  const senderName = searchParams.get("senderName") || undefined;

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
        for await (const event of streamAgentResponse({
          agentId,
          text,
          channelId,
          conversationId,
          skillId,
          senderName,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`)
        );
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
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
