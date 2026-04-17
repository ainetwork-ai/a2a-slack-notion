// @ts-expect-error TODO: add `pino` and `pino-pretty` to slack/package.json — notion's shared logger depends on them
import pino from 'pino';
import { randomUUID } from 'node:crypto';

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
  return randomUUID();
}

export type Logger = pino.Logger;
