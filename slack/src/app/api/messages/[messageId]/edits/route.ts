import { db } from "@/lib/db";
import { messageEdits, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { messageId } = await params;

  const edits = await db
    .select({
      id: messageEdits.id,
      previousContent: messageEdits.previousContent,
      editedAt: messageEdits.editedAt,
      editedBy: users.displayName,
    })
    .from(messageEdits)
    .leftJoin(users, eq(messageEdits.editedBy, users.id))
    .where(eq(messageEdits.messageId, messageId))
    .orderBy(desc(messageEdits.editedAt));

  return NextResponse.json({ edits });
}
