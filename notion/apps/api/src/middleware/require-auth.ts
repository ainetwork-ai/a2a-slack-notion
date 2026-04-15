import type { MiddlewareHandler } from 'hono';
import type { AppVariables } from '../types/app.js';

export const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json(
      { object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' },
      401,
    );
  }
  await next();
};
