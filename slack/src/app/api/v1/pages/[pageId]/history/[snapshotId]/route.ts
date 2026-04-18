import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageSnapshots } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string; snapshotId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId, snapshotId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'can_view');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const snapshot = await db
    .select()
    .from(pageSnapshots)
    .where(and(eq(pageSnapshots.id, snapshotId), eq(pageSnapshots.pageId, pageId)))
    .limit(1)
    .then((r) => r[0]);

  if (!snapshot) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Snapshot not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: snapshot.id,
    pageId: snapshot.pageId,
    title: snapshot.title,
    createdBy: snapshot.createdBy,
    createdAt: snapshot.createdAt,
    snapshot: snapshot.snapshot,
  });
}
