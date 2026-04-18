import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionApiKeys as apiKeysTable } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const user = await getDefaultUser();
  const { keyId } = await params;

  const existing = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, keyId))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'API key not found' },
      { status: 404 },
    );
  }

  await db
    .delete(apiKeysTable)
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, user.id)));

  return NextResponse.json({ object: 'api_key', id: keyId, deleted: true });
}
