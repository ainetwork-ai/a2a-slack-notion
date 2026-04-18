import { NextResponse } from 'next/server';

// TODO: port invite acceptance — depends on a prisma `workspaceInvite` model
// that is not present in the shared Slack schema. Schema work required first.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Workspace invite accept is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
