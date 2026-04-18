/**
 * Default-user helper replicating the Hono default-user middleware.
 *
 * The Notion API is fully public: every request is attributed to a single
 * "Default User" row in the shared Slack Postgres so `createdBy`/`userId` FKs
 * still resolve. Call `getDefaultUser()` at the top of each route handler.
 */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from '@/lib/db/schema';
import type { DefaultUser } from './types';

const DEFAULT_ADDR = 'default';

export async function getDefaultUser(): Promise<DefaultUser> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.ainAddress, DEFAULT_ADDR))
    .limit(1)
    .then((r) => r[0]);

  const row = existing
    ?? (await db
      .insert(users)
      .values({ ainAddress: DEFAULT_ADDR, displayName: 'Default User' })
      .returning()
      .then((r) => r[0]));

  if (!row) {
    throw new Error('Failed to upsert default user');
  }

  return {
    id: row.id,
    walletAddress: row.ainAddress,
    name: row.displayName,
    image: row.avatarUrl ?? null,
    createdAt: row.createdAt,
  };
}
