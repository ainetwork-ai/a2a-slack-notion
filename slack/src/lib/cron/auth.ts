import { NextRequest, NextResponse } from 'next/server';

/**
 * requireCronSecret — shared auth guard for all /api/cron/* routes.
 *
 * Accepts the secret via:
 *   - Header:  Authorization: Bearer <CRON_SECRET>
 *   - Query:   ?secret=<CRON_SECRET>
 *
 * Returns a 401 NextResponse if the secret is missing or wrong, null if OK.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server' },
      { status: 500 }
    );
  }

  // Check Authorization header first
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const provided = authHeader.slice('Bearer '.length).trim();
    if (provided === secret) return null;
  }

  // Fallback: ?secret= query param
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get('secret');
  if (querySecret === secret) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
