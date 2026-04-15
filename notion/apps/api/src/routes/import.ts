import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { markdownToBlocks } from '../lib/import-markdown.js';
import type { AppVariables } from '../types/app.js';
import type { BlockCreateInput } from '../lib/import-markdown.js';

const importRoutes = new Hono<{ Variables: AppVariables }>();

function requireUser(c: { get: (key: 'user') => AppVariables['user'] }) {
  const user = c.get('user');
  if (!user) return null;
  return user;
}

// ---------------------------------------------------------------------------
// POST /api/v1/import/notion
// Accept multipart/form-data with a single file field "file"
// Supports .md files for now (ZIP support can be added later)
// ---------------------------------------------------------------------------
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

  // Parse multipart form
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

  // Derive page title from filename (strip extension)
  const baseName = fileName.replace(/\.(md|markdown)$/i, '');
  const pageTitle = baseName || 'Imported Page';

  // Parse markdown → blocks
  const blockInputs = markdownToBlocks(mdText);

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create root page block
    const page = await tx.block.create({
      data: {
        type: 'page',
        parentId: null,
        pageId: '',
        workspaceId,
        createdBy: user.id,
        properties: { title: pageTitle, icon: null, coverUrl: null },
        content: {},
      },
    });

    // 2. Set pageId = self
    await tx.block.update({ where: { id: page.id }, data: { pageId: page.id } });

    // 3. Create child blocks and collect their IDs in order
    const childIds: string[] = [];

    for (const input of blockInputs) {
      const child = await createBlockRecursive(tx, input, page.id, page.id, workspaceId, user.id);
      childIds.push(child.id);
    }

    // 4. Update page childrenOrder
    await tx.block.update({
      where: { id: page.id },
      data: { childrenOrder: childIds },
    });

    return { id: page.id, title: pageTitle, blockCount: childIds.length };
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

// ---------------------------------------------------------------------------
// Recursive block creator (handles children if present)
// ---------------------------------------------------------------------------
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function createBlockRecursive(
  tx: TxClient,
  input: BlockCreateInput,
  parentId: string,
  pageId: string,
  workspaceId: string,
  createdBy: string,
): Promise<{ id: string }> {
  const block = await tx.block.create({
    data: {
      type: input.type as never,
      parentId,
      pageId,
      workspaceId,
      createdBy,
      properties: input.properties as never,
      content: input.content as never,
      childrenOrder: [],
    },
    select: { id: true },
  });

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
    await tx.block.update({
      where: { id: block.id },
      data: { childrenOrder: childIds },
    });
  }

  return block;
}

export { importRoutes };
