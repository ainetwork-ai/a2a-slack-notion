import type { MiddlewareHandler } from 'hono';
import { generateTraceId } from '@notion/shared';

export const traceMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = c.req.header('x-trace-id') ?? generateTraceId();
  c.set('traceId', traceId);
  c.header('x-trace-id', traceId);
  await next();
};
