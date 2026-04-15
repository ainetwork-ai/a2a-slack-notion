import { db } from "@/lib/db";
import { threadSubscriptions, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId");

  if (messageId) {
    // Check if current user is subscribed to a specific thread
    const [sub] = await db
      .select()
      .from(threadSubscriptions)
      .where(
        and(
          eq(threadSubscriptions.userId, user.id),
          eq(threadSubscriptions.messageId, messageId)
        )
      )
      .limit(1);

    return NextResponse.json({ subscribed: !!sub });
  }

  // List all subscribed thread parent message IDs for the user
  const rows = await db
    .select({ messageId: threadSubscriptions.messageId })
    .from(threadSubscriptions)
    .where(eq(threadSubscriptions.userId, user.id));

  return NextResponse.json({ subscriptions: rows.map((r) => r.messageId) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { messageId } = body as { messageId: string };

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  // Verify the message exists
  const [msg] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Upsert subscription (ignore conflict)
  const [sub] = await db
    .insert(threadSubscriptions)
    .values({ userId: user.id, messageId })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ subscription: sub ?? null }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { messageId } = body as { messageId: string };

  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  await db
    .delete(threadSubscriptions)
    .where(
      and(
        eq(threadSubscriptions.userId, user.id),
        eq(threadSubscriptions.messageId, messageId)
      )
    );

  return NextResponse.json({ success: true });
}
