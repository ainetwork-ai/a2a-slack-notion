import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/notion/db';
import { notionApiKeys as apiKeysTable } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const rawHex = randomBytes(16).toString('hex');
  const fullKey = `ntn_${rawHex}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = `ntn_${rawHex.slice(0, 8)}`;

  const apiKey = await db
    .insert(apiKeysTable)
    .values({
      userId: user.id,
      name: parsed.data.name,
      keyHash,
      keyPrefix,
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(
    {
      object: 'api_key',
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    },
    { status: 201 },
  );
}

export async function GET() {
  const user = await getDefaultUser();

  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      lastUsedAt: apiKeysTable.lastUsedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, user.id))
    .orderBy(desc(apiKeysTable.createdAt));

  return NextResponse.json({
    object: 'list',
    results: keys.map((k) => ({ object: 'api_key', ...k })),
  });
}
