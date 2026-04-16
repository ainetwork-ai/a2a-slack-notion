import { db } from "@/lib/db";
import { scheduledMessages, messages, channelMembers } from "@/lib/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const rows = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.userId, user.id), eq(scheduledMessages.isSent, false)))
    .orderBy(desc(scheduledMessages.scheduledFor));

  return NextResponse.json({ scheduledMessages: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { content, scheduledFor, channelId, conversationId } = body as {
    content: string;
    scheduledFor: string;
    channelId?: string;
    conversationId?: string;
  };

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!scheduledFor) {
    return NextResponse.json({ error: "scheduledFor is required" }, { status: 400 });
  }
  if (!channelId && !conversationId) {
    return NextResponse.json({ error: "channelId or conversationId is required" }, { status: 400 });
  }

  const scheduledForDate = new Date(scheduledFor);
  if (isNaN(scheduledForDate.getTime())) {
    return NextResponse.json({ error: "scheduledFor must be a valid date" }, { status: 400 });
  }

  if (scheduledForDate <= new Date()) {
    return NextResponse.json({ error: "scheduledFor must be in the future" }, { status: 400 });
  }

  const [scheduled] = await db
    .insert(scheduledMessages)
    .values({
      userId: user.id,
      channelId: channelId ?? null,
      conversationId: conversationId ?? null,
      content,
      scheduledFor: scheduledForDate,
    })
    .returning();

  return NextResponse.json({ scheduledMessage: scheduled }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(scheduledMessages)
    .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.userId, user.id), eq(scheduledMessages.isSent, false)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Scheduled message not found or already sent" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// PUT: process due scheduled messages (called by cron)
export async function PUT() {
  const now = new Date();

  const due = await db
    .select()
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.isSent, false), lte(scheduledMessages.scheduledFor, now)));

  const results = [];

  for (const sm of due) {
    try {
      if (sm.channelId) {
        // Verify user is still a member
        const [membership] = await db
          .select()
          .from(channelMembers)
          .where(and(eq(channelMembers.channelId, sm.channelId), eq(channelMembers.userId, sm.userId)))
          .limit(1);

        if (membership) {
          await db.insert(messages).values({
            channelId: sm.channelId,
            userId: sm.userId,
            content: sm.content,
          });
        }
      } else if (sm.conversationId) {
        await db.insert(messages).values({
          conversationId: sm.conversationId,
          userId: sm.userId,
          content: sm.content,
        });
      }

      await db
        .update(scheduledMessages)
        .set({ isSent: true })
        .where(eq(scheduledMessages.id, sm.id));

      results.push({ id: sm.id, sent: true });
    } catch {
      results.push({ id: sm.id, sent: false });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
