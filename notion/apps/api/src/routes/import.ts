import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { blocks, type BlockType } from '../../../../slack/src/lib/db/schema';
import { markdownToBlocks } from '../lib/import-markdown.js';
import type { AppVariables } from '../types/app.js';
import type { BlockCreateInput } from '../lib/import-markdown.js';

const importRoutes = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// Tx type used by the recursive block creator. Drizzle exposes no named
// transaction-client type, so we derive one from the callback signature.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function createBlockRecursive(
  tx: Tx,
  input: BlockCreateInput,
  parentId: string,
  pageId: string,
  workspaceId: string,
  createdBy: string,
): Promise<{ id: string }> {
  const block = await tx
    .insert(blocks)
    .values({
      type: input.type as BlockType,
      parentId,
      pageId,
      workspaceId,
      createdBy,
      properties: input.properties,
      content: input.content,
      childrenOrder: [],
    })
    .returning({ id: blocks.id })
    .then((r) => r[0]!);

  if (input.children && input.children.length > 0) {
    const childIds: string[] = [];
    for (const childInput of input.children) {
      const child = await createBlockRecursive(
        tx,
        childInput,
        block.id,
        pageId,
        workspaceId,
        createdBy,
      );
      childIds.push(child.id);
    }
    await tx
      .update(blocks)
      .set({ childrenOrder: childIds })
      .where(eq(blocks.id, block.id));
  }

  return block;
}

// POST /api/v1/import/notion (multipart/form-data, .md only)
importRoutes.post('/notion', async (c) => {
  const user = requireUser(c);
  if (!user)
    return c.json(
      { object: 'error', status: 401, code: 'unauthorized', message: 'Not authenticated' },
      401,
    );

  const workspaceId = c.req.query('workspace_id');
  if (!workspaceId) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id is required' },
      400,
    );
  }

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json(
      { object: 'error', status: 400, code: 'parse_error', message: 'Expected multipart/form-data body' },
      400,
    );
  }

  const fileField = formData.get('file');
  if (!fileField || !(fileField instanceof File)) {
    return c.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'file field is required' },
      400,
    );
  }

  const fileName = fileField.name ?? '';
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext !== 'md' && ext !== 'markdown') {
    return c.json(
      {
        object: 'error',
        status: 400,
        code: 'unsupported_file',
        message: 'Only .md / .markdown files are supported',
      },
      400,
    );
  }

  const mdText = await fileField.text();
  const baseName = fileName.replace(/\.(md|markdown)$/i, '');
  const pageTitle = baseName || 'Imported Page';

  const blockInputs = markdownToBlocks(mdText);

  const result = await db.transaction(async (tx) => {
    // 1. Create root page block (pageId = placeholder)
    const inserted = await tx
      .insert(blocks)
      .values({
        type: 'page',
        parentId: null,
        pageId: workspaceId,
        workspaceId,
        createdBy: user.id,
        properties: { title: pageTitle, icon: null, coverUrl: null },
        content: {},
      })
      .returning({ id: blocks.id })
      .then((r) => r[0]!);

    // 2. Set pageId = self
    await tx.update(blocks).set({ pageId: inserted.id }).where(eq(blocks.id, inserted.id));

    // 3. Create child blocks and collect their IDs in order
    const childIds: string[] = [];
    for (const input of blockInputs) {
      const child = await createBlockRecursive(
        tx,
        input,
        inserted.id,
        inserted.id,
        workspaceId,
        user.id,
      );
      childIds.push(child.id);
    }

    // 4. Update page childrenOrder
    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, inserted.id));

    return { id: inserted.id, title: pageTitle, blockCount: childIds.length };
  });

  return c.json(
    {
      object: 'page',
      id: result.id,
      title: result.title,
      blockCount: result.blockCount,
    },
    201,
  );
});

export { importRoutes };
