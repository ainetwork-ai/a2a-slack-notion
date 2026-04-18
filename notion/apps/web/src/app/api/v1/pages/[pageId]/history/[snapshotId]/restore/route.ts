import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { pageSnapshots, blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';

const RestoreSchema = z.object({
  label: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string; snapshotId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId, snapshotId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'can_edit');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = RestoreSchema.safeParse(body);
  const label = parsed.success ? parsed.data.label : undefined;

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

  const page = await db
    .select({ properties: blocks.properties, content: blocks.content })
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

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const currentContent = (page.content ?? {}) as Record<string, unknown>;
  const currentTitle = (props['title'] as string) ?? 'Untitled';
  const currentYjs = currentContent['yjsSnapshot'];

  const safetyB64 =
    currentYjs && typeof currentYjs === 'string'
      ? currentYjs
      : Buffer.alloc(0).toString('base64');

  const safetyTitle = label
    ? `Before restore — ${label}`
    : `Before restore — ${new Date().toISOString()}`;

  await db.transaction(async (tx) => {
    await tx.insert(pageSnapshots).values({
      pageId,
      title: safetyTitle,
      snapshot: safetyB64,
      createdBy: user.id,
    });

    await tx
      .update(blocks)
      .set({
        properties: { ...props, title: snapshot.title },
        content: {
          ...currentContent,
          yjsSnapshot: snapshot.snapshot,
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(blocks.id, pageId));
  });

  return NextResponse.json({
    object: 'page',
    id: pageId,
    restoredFrom: snapshotId,
    restoredTitle: snapshot.title,
    safetySnapshotTitle: safetyTitle,
    currentTitle,
  });
}
