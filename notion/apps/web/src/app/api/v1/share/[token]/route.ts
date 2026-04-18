import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { shareLinks, blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const link = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1)
    .then((r) => r[0]);

  if (!link) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Share link not found' },
      { status: 404 },
    );
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json(
      { object: 'error', status: 410, code: 'share_link_expired', message: 'This share link has expired' },
      { status: 410 },
    );
  }

  if (!link.isPublic) {
    // Authentication would be required; default user is always available, so we skip
    await getDefaultUser();
  }

  const page = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, link.pageId), eq(blocks.archived, false)))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const children = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.parentId, page.id), eq(blocks.archived, false)))
    .orderBy(asc(blocks.createdAt));

  return NextResponse.json({
    object: 'shared_page',
    accessLevel: link.level,
    readOnly: link.level === 'can_view',
    page: { ...page, children },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getDefaultUser();
  const { token } = await params;

  const link = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1)
    .then((r) => r[0]);

  if (!link) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Share link not found' },
      { status: 404 },
    );
  }

  const hasPermission = await checkPagePermission(user.id, link.pageId, 'full_access');
  if (!hasPermission) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Not authorized to delete this share link' },
      { status: 403 },
    );
  }

  await db.delete(shareLinks).where(eq(shareLinks.token, token));
  return NextResponse.json({ object: 'share_link', token, deleted: true });
}
