import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendA2AMessage } from "./client";

export async function sendToAgent(params: {
  agentId: string;
  text: string;
  channelId?: string;
  conversationId?: string;
  skillId?: string;
}) {
  const [agent] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.agentId))
    .limit(1);

  if (!agent?.a2aUrl) throw new Error("Agent not found or no A2A URL");

  const agentName = agent.displayName;

  let content: string;
  let metadata: Record<string, unknown>;

  try {
    const response = await sendA2AMessage(agent.a2aUrl, params.text, {
      agentName,
      skillId: params.skillId,
    });
    content = response.content;
    metadata = {
      a2aTaskId: response.taskId,
      a2aContextId: response.contextId,
      agentName,
    };
  } catch {
    content = "I'm currently unavailable. Please try again later.";
    metadata = { agentName, error: true };
  }

  const [agentMessage] = await db
    .insert(messages)
    .values({
      channelId: params.channelId || null,
      conversationId: params.conversationId || null,
      userId: agent.id,
      content,
      contentType: "agent-response",
      metadata,
    })
    .returning();

  return agentMessage;
}
