import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getAddress } from 'viem';
import { eq } from 'drizzle-orm';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../lib/auth.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { db } from '../lib/db.js';
import { users } from '../../../../slack/src/lib/db/schema';
import type { AuthenticatedUser } from '../types/auth.js';

const authRoutes = new Hono();

function toAuthenticatedUser(u: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: u.id,
    walletAddress: u.ainAddress,
    name: u.displayName,
    image: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

// POST /api/auth/connect — wallet address만으로 로그인 (지갑 연결 = 인증)
authRoutes.post('/connect', async (c) => {
  const { walletAddress: rawAddress } = await c.req.json<{ walletAddress: string }>();

  if (!rawAddress) {
    return c.json({ error: 'Missing walletAddress' }, 400);
  }

  try {
    const walletAddress = getAddress(rawAddress); // EIP-55 정규화

    // Drizzle has no single-step upsert-by-unique-key helper. Try insert first;
    // on conflict, read the existing row.
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.ainAddress, walletAddress))
      .limit(1)
      .then((r) => r[0]);

    const user =
      existing ??
      (await db
        .insert(users)
        .values({
          ainAddress: walletAddress,
          displayName: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        })
        .returning()
        .then((r) => r[0]!));

    const token = await signToken({ sub: user.id, walletAddress: user.ainAddress });
    setCookie(c, COOKIE_NAME, token, COOKIE_OPTIONS);

    return c.json({
      user: toAuthenticatedUser(user) satisfies AuthenticatedUser,
    });
  } catch {
    return c.json({ error: 'Invalid wallet address' }, 400);
  }
});

// POST /api/auth/logout — clear session cookie
authRoutes.post('/logout', (c) => {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.json({ success: true });
});

// GET /api/auth/session — validate JWT, return current user
authRoutes.get('/session', async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!token) {
    return c.json({ user: null }, 401);
  }

  try {
    const payload = await verifyToken(token);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1)
      .then((r) => r[0]);

    if (!user) {
      deleteCookie(c, COOKIE_NAME, { path: '/' });
      return c.json({ user: null }, 401);
    }

    return c.json({ user: toAuthenticatedUser(user) });
  } catch {
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    return c.json({ user: null }, 401);
  }
});

export { authRoutes };
