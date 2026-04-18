import pino from 'pino';

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}

export function generateTraceId(): string {
  // Web Crypto's randomUUID works in modern browsers AND Node 18+. Avoid
  // `node:crypto` so this module stays safe to bundle into client components
  // that transitively import from `@notion/shared`.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback — not cryptographically strong, good enough for trace IDs.
  return (
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
}

export type Logger = pino.Logger;
