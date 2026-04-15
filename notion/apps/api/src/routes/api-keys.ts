import { Hono } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
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

  // Generate key: ntn_ + 32 random hex chars
  const rawHex = randomBytes(16).toString('hex'); // 32 hex chars
  const fullKey = `ntn_${rawHex}`;

  // Hash for storage
  const keyHash = createHash('sha256').update(fullKey).digest('hex');

  // Prefix for display: ntn_ + first 8 hex chars
  const keyPrefix = `ntn_${rawHex.slice(0, 8)}`;

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      keyHash,
      keyPrefix,
    },
  });

  // Return full key ONLY once
  return c.json(
    {
      object: 'api_key',
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey, // shown only at creation
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    },
    201,
  );
});

// GET / — List user's API keys (never return full key)
apiKeys.get('/', async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

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

  const existing = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ object: 'error', status: 404, code: 'not_found', message: 'API key not found' }, 404);
  }

  await prisma.apiKey.delete({ where: { id: keyId } });

  return c.json({ object: 'api_key', id: keyId, deleted: true });
});

export { apiKeys };
