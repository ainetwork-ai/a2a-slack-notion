import type { MiddlewareHandler } from 'hono';
import type { AppVariables } from '../types/app.js';
import { checkPagePermission } from '../lib/permissions.js';

type PermLevel = 'full_access' | 'can_edit' | 'can_comment' | 'can_view';

/**
 * Middleware factory that checks if the authenticated user has at least `level`
 * permission on the target page.
 *
 * pageId resolution order:
 *   1. Route param :pageId
 *   2. Query param page_id
 *
 * If no pageId can be resolved, the check is skipped (workspace-level routes).
 */
export function requirePermission(level: PermLevel): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get('user');

    // Demo mode: allow unauthenticated viewing
    if (level === 'can_view' && !user) {
      await next();
      return;
    }

    if (!user) {
      return c.json(
        { object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' },
        401,
      );
    }

    // Resolve pageId from route params or query string
    const params = c.req.param() as Record<string, string>;
    const pageId: string | undefined = params['pageId'] ?? c.req.query('page_id');

    // No pageId available — skip permission check (workspace-level route)
    if (!pageId) {
      await next();
      return;
    }

    const allowed = await checkPagePermission(user.id, pageId, level);
    if (!allowed) {
      return c.json(
        {
          object: 'error',
          status: 403,
          code: 'forbidden',
          message: `Insufficient permission. Required: ${level}`,
        },
        403,
      );
    }

    await next();
  };
}
