import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks, type BlockType } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { markdownToBlocks, type BlockCreateInput } from '@/lib/notion/import-markdown';

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
      const child = await createBlockRecursive(tx, childInput, block.id, pageId, workspaceId, createdBy);
      childIds.push(child.id);
    }
    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, block.id));
  }

  return block;
}

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspace_id');
  if (!workspaceId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'workspace_id is required' },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'parse_error', message: 'Expected multipart/form-data body' },
      { status: 400 },
    );
  }

  const fileField = formData.get('file');
  if (!fileField || !(fileField instanceof File)) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'file field is required' },
      { status: 400 },
    );
  }

  const fileName = fileField.name ?? '';
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext !== 'md' && ext !== 'markdown') {
    return NextResponse.json(
      {
        object: 'error',
        status: 400,
        code: 'unsupported_file',
        message: 'Only .md / .markdown files are supported',
      },
      { status: 400 },
    );
  }

  const mdText = await fileField.text();
  const baseName = fileName.replace(/\.(md|markdown)$/i, '');
  const pageTitle = baseName || 'Imported Page';

  const blockInputs = markdownToBlocks(mdText);

  const result = await db.transaction(async (tx) => {
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

    await tx.update(blocks).set({ pageId: inserted.id }).where(eq(blocks.id, inserted.id));

    const childIds: string[] = [];
    for (const input of blockInputs) {
      const child = await createBlockRecursive(tx, input, inserted.id, inserted.id, workspaceId, user.id);
      childIds.push(child.id);
    }

    await tx.update(blocks).set({ childrenOrder: childIds }).where(eq(blocks.id, inserted.id));

    return { id: inserted.id, title: pageTitle, blockCount: childIds.length };
  });

  return NextResponse.json(
    {
      object: 'page',
      id: result.id,
      title: result.title,
      blockCount: result.blockCount,
    },
    { status: 201 },
  );
}
