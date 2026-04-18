import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionWebhooks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getDefaultUser();
  const { id } = await params;

  const existing = await db
    .select()
    .from(notionWebhooks)
    .where(eq(notionWebhooks.id, id))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Webhook not found' },
      { status: 404 },
    );
  }
  if (existing.userId !== user.id) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Access denied' },
      { status: 403 },
    );
  }

  await db.delete(notionWebhooks).where(eq(notionWebhooks.id, id));

  return NextResponse.json({ object: 'webhook', id, deleted: true });
}
