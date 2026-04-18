import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  pagePermissions,
  users,
  type PermissionLevel,
} from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

const SetPermissionSchema = z.object({
  userId: z.string(),
  level: z.enum(['full_access', 'can_edit', 'can_comment', 'can_view']),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'full_access');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const perms = await db
    .select()
    .from(pagePermissions)
    .where(eq(pagePermissions.pageId, pageId))
    .orderBy(asc(pagePermissions.createdAt));

  const userIds = Array.from(new Set(perms.map((p) => p.userId)));
  const userRows =
    userIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.displayName,
            image: users.avatarUrl,
            walletAddress: users.ainAddress,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return NextResponse.json(
    perms.map((p) => ({ ...p, user: userMap.get(p.userId) ?? null })),
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const caller = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(caller.id, pageId, 'full_access');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = SetPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { userId, level } = parsed.data;

  const existing = await db
    .select()
    .from(pagePermissions)
    .where(and(eq(pagePermissions.pageId, pageId), eq(pagePermissions.userId, userId)))
    .limit(1)
    .then((r) => r[0]);

  const perm = existing
    ? await db
        .update(pagePermissions)
        .set({ level: level as PermissionLevel })
        .where(eq(pagePermissions.id, existing.id))
        .returning()
        .then((r) => r[0]!)
    : await db
        .insert(pagePermissions)
        .values({ pageId, userId, level: level as PermissionLevel })
        .returning()
        .then((r) => r[0]!);

  const u = await db
    .select({ id: users.id, name: users.displayName, image: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

  return NextResponse.json({ ...perm, user: u });
}
