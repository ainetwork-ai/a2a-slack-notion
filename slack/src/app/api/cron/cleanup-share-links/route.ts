/**
 * GET|POST /api/cron/cleanup-share-links
 *
 * Deletes share links whose expiresAt is in the past.
 * Protected by CRON_SECRET (Authorization: Bearer or ?secret=).
 *
 * Returns: { deleted: number, scanned: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { and, isNotNull, lt } from 'drizzle-orm';
import { requireCronSecret } from '@/lib/cron/auth';

async function handler(req: NextRequest): Promise<NextResponse> {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const now = new Date();

  // Count total first so we can report scanned
  const all = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(isNotNull(shareLinks.expiresAt));

  const scanned = all.length;

  const deleted = await db
    .delete(shareLinks)
    .where(
      and(
        isNotNull(shareLinks.expiresAt),
        lt(shareLinks.expiresAt, now)
      )
    )
    .returning({ id: shareLinks.id });

  return NextResponse.json({ deleted: deleted.length, scanned });
}

export const GET = handler;
export const POST = handler;
