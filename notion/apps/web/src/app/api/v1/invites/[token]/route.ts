import { NextResponse } from 'next/server';

// TODO: port invite preview — depends on a prisma `workspaceInvite` model that
// is not present in the shared Slack schema. Schema work required first.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Workspace invite preview is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
