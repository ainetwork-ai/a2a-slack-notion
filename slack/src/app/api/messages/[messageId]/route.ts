import { db } from "@/lib/db";
import { users, channels, channelMembers, messages, reactions, mentions, files, notifications } from "@/lib/db/schema";
import { eq, and, desc, lt, sql, inArray, or, ilike } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { messageId } = await params;

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.userId !== user.id) {
    return NextResponse.json({ error: "Only the message author can edit" }, { status: 403 });
  }

  const body = await request.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(messages)
    .set({ content, isEdited: true, updatedAt: new Date() })
    .where(eq(messages.id, messageId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { messageId } = await params;

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.userId !== user.id) {
    return NextResponse.json({ error: "Only the message author can delete" }, { status: 403 });
  }

  await db.delete(messages).where(eq(messages.id, messageId));

  return NextResponse.json({ success: true });
}
