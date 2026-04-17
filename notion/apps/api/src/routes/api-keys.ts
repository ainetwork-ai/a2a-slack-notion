import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, apiKeys as apiKeysTable } from '../lib/db.js';
import type { AppVariables } from '../types/app.js';
import { z } from 'zod';

const apiKeys = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// POST / — Create a new API key
apiKeys.post('/', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const body = await c.req.json();
  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);
  }

  const rawHex = randomBytes(16).toString('hex');
  const fullKey = `ntn_${rawHex}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = `ntn_${rawHex.slice(0, 8)}`;

  const apiKey = await db
    .insert(apiKeysTable)
    .values({
      userId: user.id,
      name: parsed.data.name,
      keyHash,
      keyPrefix,
    })
    .returning()
    .then((r) => r[0]!);

  return c.json(
    {
      object: 'api_key',
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    },
    201,
  );
});

// GET / — List user's API keys
apiKeys.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      lastUsedAt: apiKeysTable.lastUsedAt,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, user.id))
    .orderBy(desc(apiKeysTable.createdAt));

  return c.json({
    object: 'list',
    results: keys.map((k) => ({ object: 'api_key', ...k })),
  });
});

// DELETE /:keyId — Revoke an API key
apiKeys.delete('/:keyId', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const { keyId } = c.req.param();

  const existing = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, keyId))
    .limit(1)
    .then((r) => r[0]);

  if (!existing || existing.userId !== user.id) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'API key not found' }, 404);
  }

  await db
    .delete(apiKeysTable)
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, user.id)));

  return c.json({ object: 'api_key', id: keyId, deleted: true });
});

export { apiKeys };
