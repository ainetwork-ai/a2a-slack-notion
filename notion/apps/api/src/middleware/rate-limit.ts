import type { Context, Next } from 'hono';
import type { AppVariables } from '../types/app.js';

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

interface WindowEntry {
  count: number;
  resetAt: number;
}

// In-memory sliding window — sufficient for 1-20 users
const windows = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows.entries()) {
    if (entry.resetAt < now) {
      windows.delete(key);
    }
  }
}, 5 * 60_000);

export function rateLimit() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const user = c.get('user');
    const key = user ? `ratelimit:user:${user.id}` : `ratelimit:ip:${c.req.header('x-forwarded-for') ?? c.req.raw.headers.get('x-real-ip') ?? 'unknown'}`;

    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || existing.resetAt < now) {
      // Start a new window
      windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
      await next();
      return;
    }

    existing.count += 1;

    if (existing.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(MAX_REQUESTS));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
      return c.json(
        { object: 'error', status: 429, code: 'rate_limited', message: 'Too many requests. Please retry after the window resets.' },
        429,
      );
    }

    c.header('X-RateLimit-Limit', String(MAX_REQUESTS));
    c.header('X-RateLimit-Remaining', String(MAX_REQUESTS - existing.count));
    c.header('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));

    await next();
  };
}
