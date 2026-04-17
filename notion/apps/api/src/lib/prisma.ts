/**
 * @deprecated Compatibility shim. All notion API routes have been migrated
 * to Drizzle (see `./db.js`). This file remains only so `hocuspocus.ts`
 * (owned by another agent) continues to compile and run until it too is
 * ported. The shim supports the tiny subset of Prisma surface that
 * hocuspocus uses: `prisma.block.findUnique`, `prisma.block.update`, and
 * `prisma.pageSnapshot.create`.
 */
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { blocks, pageSnapshots } from '../../../../slack/src/lib/db/schema';

type UnknownRecord = Record<string, unknown>;

async function findBlock(where: { id: string }) {
  return await db
    .select()
    .from(blocks)
    .where(eq(blocks.id, where.id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

async function updateBlock(where: { id: string }, data: UnknownRecord) {
  // Drizzle accepts only known fields; pass the data as-is and let the
  // caller take the typing responsibility.
  const row = await db
    .update(blocks)
    .set(data as never)
    .where(eq(blocks.id, where.id))
    .returning()
    .then((r) => r[0]);
  return row ?? null;
}

async function createSnapshot(data: {
  pageId: string;
  title: string;
  snapshot: Buffer | string;
  createdBy: string;
}) {
  const snapshotStr =
    typeof data.snapshot === 'string'
      ? data.snapshot
      : data.snapshot.toString('base64');

  return await db
    .insert(pageSnapshots)
    .values({
      pageId: data.pageId,
      title: data.title,
      snapshot: snapshotStr,
      createdBy: data.createdBy,
    })
    .returning()
    .then((r) => r[0]!);
}

export const prisma = {
  block: {
    findUnique: async ({ where }: { where: { id: string }; select?: unknown }) =>
      findBlock(where),
    update: async ({ where, data }: { where: { id: string }; data: UnknownRecord }) =>
      updateBlock(where, data),
  },
  pageSnapshot: {
    create: async ({ data }: { data: Parameters<typeof createSnapshot>[0] }) =>
      createSnapshot(data),
  },
};

export { db } from './db.js';
