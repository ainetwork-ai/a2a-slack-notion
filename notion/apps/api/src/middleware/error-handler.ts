import type { ErrorHandler } from 'hono';
import { AppError } from '@notion/shared';

export const errorHandler: ErrorHandler = (err, c) => {
  const traceId = c.get('traceId') as string | undefined;

  if (err instanceof AppError) {
    return c.json({ ...err.toJSON(), request_id: traceId }, err.status as 400);
  }

  console.error(`[${traceId}] Unhandled error:`, err);

  return c.json(
    {
      object: 'error' as const,
      status: 500,
      code: 'internal_server_error',
      message: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : String(err),
      request_id: traceId,
    },
    500,
  );
};
