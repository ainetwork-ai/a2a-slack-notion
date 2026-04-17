/**
 * GET|POST /api/cron/compact-page-snapshots
 *
 * For every page that has snapshots:
 *   1. Keep the most recent KEEP_LATEST (default 10) snapshots.
 *   2. Delete any snapshot older than TTL_DAYS (default 30; env SNAPSHOT_TTL_DAYS).
 *
 * Both rules apply: a snapshot is deleted if it falls outside the keep window
 * OR is older than the TTL, whichever is more aggressive.
 *
 * Protected by CRON_SECRET (Authorization: Bearer or ?secret=).
 *
 * Returns: { pagesProcessed: number, snapshotsDeleted: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pageSnapshots } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';
import { requireCronSecret } from '@/lib/cron/auth';

const KEEP_LATEST = 10;

async function handler(req: NextRequest): Promise<NextResponse> {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const ttlDays = parseInt(process.env.SNAPSHOT_TTL_DAYS ?? '30', 10);
  const cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);

  // Collect distinct page IDs that have snapshots
  const pages = await db
    .selectDistinct({ pageId: pageSnapshots.pageId })
    .from(pageSnapshots);

  let pagesProcessed = 0;
  let snapshotsDeleted = 0;

  for (const { pageId } of pages) {
    // Delete any snapshot for this page that either:
    //   (a) is older than the TTL cutoff, OR
    //   (b) is not among the KEEP_LATEST most recent ones
    //
    // We use a single DELETE … WHERE id NOT IN (SELECT id … ORDER BY created_at DESC LIMIT N)
    // combined with the TTL condition via OR to cover both cases efficiently.
    const deleted = await db
      .delete(pageSnapshots)
      .where(
        sql`${pageSnapshots.pageId} = ${pageId}
            AND (
              ${pageSnapshots.createdAt} < ${cutoffDate.toISOString()}
              OR ${pageSnapshots.id} NOT IN (
                SELECT id FROM page_snapshots
                WHERE page_id = ${pageId}
                ORDER BY created_at DESC
                LIMIT ${KEEP_LATEST}
              )
            )`
      )
      .returning({ id: pageSnapshots.id });

    snapshotsDeleted += deleted.length;
    pagesProcessed++;
  }

  return NextResponse.json({ pagesProcessed, snapshotsDeleted });
}

export const GET = handler;
export const POST = handler;
