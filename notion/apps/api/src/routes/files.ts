import { Hono } from 'hono';
import { z } from 'zod';
import { getUploadUrl, getDownloadUrl, deleteFile, fileKey } from '../lib/storage.js';
import type { AppVariables } from '../types/app.js';

const files = new Hono<{ Variables: AppVariables }>();

const UploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  workspaceId: z.string().min(1),
});

// Get presigned upload URL
files.post('/upload-url', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const body = await c.req.json();
  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ object: 'error', status: 400, code: 'validation_error', message: parsed.error.message }, 400);

  const key = fileKey(parsed.data.workspaceId, parsed.data.fileName);
  const url = await getUploadUrl(key, parsed.data.contentType);

  return c.json({ url, key });
});

// Get presigned download URL
files.get('/download-url', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const key = c.req.query('key');
  if (!key) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'key required' }, 400);

  const url = await getDownloadUrl(key);
  return c.json({ url });
});

// Delete file
files.delete('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' }, 401);

  const key = c.req.query('key');
  if (!key) return c.json({ object: 'error', status: 400, code: 'validation_error', message: 'key required' }, 400);

  await deleteFile(key);
  return c.json({ object: 'file', key, deleted: true });
});

export { files };
