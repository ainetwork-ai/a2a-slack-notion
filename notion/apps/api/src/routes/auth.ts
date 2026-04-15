import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getAddress } from 'viem';
import { COOKIE_NAME, COOKIE_OPTIONS } from '../lib/auth.js';
import { signToken, verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';

const authRoutes = new Hono();

// POST /api/auth/connect — wallet address만으로 로그인 (지갑 연결 = 인증)
authRoutes.post('/connect', async (c) => {
  const { walletAddress: rawAddress } = await c.req.json<{ walletAddress: string }>();

  if (!rawAddress) {
    return c.json({ error: 'Missing walletAddress' }, 400);
  }

  try {
    const walletAddress = getAddress(rawAddress); // EIP-55 정규화

    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: {
        walletAddress,
        name: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      },
    });

    const token = await signToken({ sub: user.id, walletAddress: user.walletAddress });
    setCookie(c, COOKIE_NAME, token, COOKIE_OPTIONS);

    return c.json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        name: user.name,
        image: user.image,
        createdAt: user.createdAt,
      } satisfies AuthenticatedUser,
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
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, walletAddress: true, name: true, image: true, createdAt: true },
    });

    if (!user) {
      deleteCookie(c, COOKIE_NAME, { path: '/' });
      return c.json({ user: null }, 401);
    }

    return c.json({ user: user as AuthenticatedUser });
  } catch {
    deleteCookie(c, COOKIE_NAME, { path: '/' });
    return c.json({ user: null }, 401);
  }
});

export { authRoutes };
