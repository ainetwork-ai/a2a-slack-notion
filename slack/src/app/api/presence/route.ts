import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";

const VALID_STATUSES = ["online", "away", "idle", "dnd", "offline"] as const;
type UserStatus = typeof VALID_STATUSES[number];

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let status: UserStatus = "online";
  try {
    const body = await request.json();
    if (body?.status && VALID_STATUSES.includes(body.status)) {
      status = body.status as UserStatus;
    }
  } catch {
    // No body — default to online
  }

  await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ status });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await request.json();
  const { statusMessage, statusEmoji, statusExpiresAt, status } = body;

  const validStatus: UserStatus | undefined =
    status !== undefined && VALID_STATUSES.includes(status as UserStatus)
      ? (status as UserStatus)
      : undefined;

  const expiresAt =
    statusExpiresAt != null ? new Date(statusExpiresAt) : null;

  await db
    .update(users)
    .set({
      ...(statusMessage !== undefined ? { statusMessage: statusMessage ?? "" } : {}),
      ...(statusEmoji !== undefined ? { statusEmoji: statusEmoji ?? null } : {}),
      ...(statusExpiresAt !== undefined ? { statusExpiresAt: expiresAt } : {}),
      ...(validStatus !== undefined ? { status: validStatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({ statusMessage, statusEmoji, statusExpiresAt: expiresAt, status: validStatus });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json({ error: "ids query param is required" }, { status: 400 });
  }

  const ids = idsParam.split(",").filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const presences = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: users.status,
      statusMessage: users.statusMessage,
      statusEmoji: users.statusEmoji,
      statusExpiresAt: users.statusExpiresAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(inArray(users.id, ids));

  return NextResponse.json(presences);
}
