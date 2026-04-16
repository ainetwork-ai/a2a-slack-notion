import { prisma } from '../lib/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import type { Context, Next } from 'hono';

// Module-level cache for demo user (avoid N+1 upsert on every request)
export let _demoUserCache: AuthenticatedUser | null = null;

// For testing: reset cache
export function _resetDemoUserCache() {
  _demoUserCache = null;
}

export async function demoModeMiddleware(
  c: Context<{ Variables: { user?: AuthenticatedUser } }>,
  next: Next,
): Promise<void | Response> {
  if (process.env['DEMO_MODE'] !== 'true') {
    await next();
    return;
  }

  if (!_demoUserCache) {
    _demoUserCache = (await prisma.user.upsert({
      where: { walletAddress: '0x000000000000000000000000000000000000DEMO' },
      update: {},
      create: {
        walletAddress: '0x000000000000000000000000000000000000DEMO',
        name: 'Demo User',
      },
      select: { id: true, walletAddress: true, name: true, image: true, createdAt: true },
    })) as AuthenticatedUser;
  }

  c.set('user', _demoUserCache);
  await next();
}

export function checkDemoModeProductionGuard(): void {
  if (process.env['NODE_ENV'] === 'production' && process.env['DEMO_MODE'] === 'true') {
    throw new Error('DEMO_MODE=true is not allowed in production.');
  }
}
