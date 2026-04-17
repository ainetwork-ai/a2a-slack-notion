import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

const SYNTHETIC_INCIDENTS: Record<string, { title: string; story: string }> = {
  incident_hormuz_001: {
    title: "Hostage situation near Strait of Hormuz",
    story:
      "Multi-source reports indicate ongoing negotiations involving regional intermediaries. " +
      "Editorial team has uncorroborated identity hints in source notes that must be excluded from any public-facing brief. " +
      "Confidential channel back-references indicate timing-sensitive movements that should be held back pending second-source confirmation.",
  },
};

export async function slack_thread_read(params: {
  channelId?: string;
  conversationId?: string;
  limit?: number;
}): Promise<string> {
  const limit = Math.min(params.limit ?? 20, 50);
  if (!params.channelId && !params.conversationId) {
    return "Either channelId or conversationId is required.";
  }
  const where = params.conversationId
    ? eq(messages.conversationId, params.conversationId)
    : eq(messages.channelId, params.channelId!);

  const rows = await db
    .select({
      content: messages.content,
      createdAt: messages.createdAt,
      displayName: users.displayName,
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(and(where))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  if (!rows.length) return "No messages in scope.";
  return rows
    .reverse()
    .map((r) => `${r.displayName ?? "unknown"}: ${r.content}`)
    .join("\n");
}

export async function notion_story_get(params: { incidentId: string }): Promise<string> {
  const incident = SYNTHETIC_INCIDENTS[params.incidentId];
  if (!incident) {
    return JSON.stringify({ error: "incident_not_found", incidentId: params.incidentId });
  }
  return JSON.stringify(incident);
}
