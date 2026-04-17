/**
 * GET /api/share/:token — JSON version of the public share data.
 *
 * Returns { page, blocks, level, expiresAt } for OG image generation,
 * preview embeds in chat, or third-party integrations.
 *
 * Security: same validation as the page route — token must exist, not be
 * expired, and isPublic=true. No auth cookie required.
 *
 * CORS: allows * because this is intentionally public data.
 *
 * TODO: Log share_link_access rows once share_link_accesses table is added
 * to schema (requires a schema migration — skipped per spec).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken, blocks } from '@/lib/notion/share-token';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const result = await validateShareToken(token);

  if (!result.valid) {
    const status = result.reason === 'not_found' ? 404 : 410;
    return NextResponse.json(
      {
        error:
          result.reason === 'not_found'
            ? 'Share link not found'
            : result.reason === 'expired'
            ? 'Share link has expired'
            : 'Share link is not publicly accessible',
      },
      { status, headers: CORS_HEADERS }
    );
  }

  const { share, page } = result.data;

  // Fetch all blocks belonging to this page
  const pageBlocks = await db
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, page.id));

  return NextResponse.json(
    {
      page,
      blocks: pageBlocks,
      level: share.level,
      expiresAt: share.expiresAt ?? null,
    },
    { headers: CORS_HEADERS }
  );
}
