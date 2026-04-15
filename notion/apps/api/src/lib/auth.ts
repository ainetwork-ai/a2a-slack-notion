import { createClient } from 'redis';
import { createLogger } from '@notion/shared';
import { SESSION_DURATION_SECONDS } from './jwt.js';

const logger = createLogger('auth');

// Redis client for nonce storage
let redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (!redis) {
    redis = createClient({ url: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
    redis.on('error', (err) => logger.error({ err }, 'Redis error'));
    await redis.connect();
  }
  return redis;
}

const NONCE_TTL = 300; // 5 minutes
const NONCE_PREFIX = 'siwe:nonce:';

export async function createNonce(): Promise<string> {
  const nonce = crypto.randomUUID();
  const client = await getRedis();
  await client.set(`${NONCE_PREFIX}${nonce}`, '1', { EX: NONCE_TTL });
  return nonce;
}

export async function consumeNonce(nonce: string): Promise<boolean> {
  const client = await getRedis();
  const deleted = await client.del(`${NONCE_PREFIX}${nonce}`);
  return deleted === 1;
}

// Cookie configuration
export const COOKIE_NAME = 'session_token';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env['NODE_ENV'] === 'production',
  path: '/',
  maxAge: SESSION_DURATION_SECONDS,
};
