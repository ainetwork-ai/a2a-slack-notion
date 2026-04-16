import { db } from "@/lib/db";
import { reminders } from "@/lib/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const rows = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, user.id), eq(reminders.isCompleted, false)))
    .orderBy(desc(reminders.remindAt));

  return NextResponse.json({ reminders: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { message, remindAt, channelId } = body as {
    message: string;
    remindAt: string;
    channelId?: string;
  };

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (!remindAt) {
    return NextResponse.json({ error: "remindAt is required" }, { status: 400 });
  }

  const remindAtDate = new Date(remindAt);
  if (isNaN(remindAtDate.getTime())) {
    return NextResponse.json({ error: "remindAt must be a valid date" }, { status: 400 });
  }

  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: user.id,
      channelId: channelId ?? null,
      message,
      remindAt: remindAtDate,
    })
    .returning();

  return NextResponse.json({ reminder }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { id } = body as { id: string };

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(reminders)
    .set({ isCompleted: true })
    .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  return NextResponse.json({ reminder: updated });
}

// Called by the polling hook to fetch due reminders
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const now = new Date();

  const due = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, user.id),
        eq(reminders.isCompleted, false),
        lte(reminders.remindAt, now)
      )
    );

  return NextResponse.json({ due });
}
