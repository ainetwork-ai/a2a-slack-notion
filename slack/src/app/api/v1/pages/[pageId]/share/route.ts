import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { shareLinks, blocks, type PermissionLevel } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

const CreateShareLinkSchema = z.object({
  level: z.enum(['full_access', 'can_edit', 'can_comment', 'can_view']).default('can_view'),
  isPublic: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
});

function newToken(): string {
  return randomBytes(18).toString('base64url');
}

export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}));
  const parsed = CreateShareLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const { level, isPublic, expiresAt } = parsed.data;

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.type, 'page')))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const link = await db
    .insert(shareLinks)
    .values({
      pageId,
      token: newToken(),
      level: level as PermissionLevel,
      isPublic,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(link, { status: 201 });
}

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

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.pageId, pageId))
    .orderBy(desc(shareLinks.createdAt));

  return NextResponse.json(links);
}
