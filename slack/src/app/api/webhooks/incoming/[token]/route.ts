import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webhooks, messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.token, token))
    .limit(1);

  if (!webhook) {
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 404 });
  }

  const body = await request.json();
  const { text, username, icon_url } = body as {
    text?: string;
    username?: string;
    icon_url?: string;
  };

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Look up or use the webhook creator as the sender
  const [sender] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, webhook.createdBy))
    .limit(1);

  if (!sender) {
    return NextResponse.json({ error: "Webhook creator not found" }, { status: 500 });
  }

  const metadata = {
    webhookId: webhook.id,
    webhookName: webhook.name,
    ...(username ? { username } : {}),
    ...(icon_url ? { icon_url } : {}),
  };

  const [message] = await db
    .insert(messages)
    .values({
      channelId: webhook.channelId,
      userId: sender.id,
      content: text.trim(),
      contentType: "text",
      metadata,
    })
    .returning();

  return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 });
}
