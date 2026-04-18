import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import {
  workspaces as workspacesTable,
  workspaceMembers,
  blocks,
} from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const workspace = await db.transaction(async (tx) => {
    const ws = await tx
      .insert(workspacesTable)
      .values({
        name: parsed.data.name,
        ...(parsed.data.icon ? { iconText: parsed.data.icon } : {}),
        createdBy: user.id,
      })
      .returning()
      .then((r) => r[0]!);

    await tx.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: user.id,
      role: 'admin',
    });

    await tx.insert(blocks).values({
      type: 'page',
      pageId: ws.id,
      workspaceId: ws.id,
      createdBy: user.id,
      properties: { title: 'Getting Started' },
      content: {},
    });

    return ws;
  });

  return NextResponse.json(workspace, { status: 201 });
}

export async function GET() {
  const user = await getDefaultUser();

  const rows = await db
    .select({
      ws: workspacesTable,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspacesTable, eq(workspacesTable.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id));

  return NextResponse.json(rows.map((m) => ({ ...m.ws, role: m.role })));
}
