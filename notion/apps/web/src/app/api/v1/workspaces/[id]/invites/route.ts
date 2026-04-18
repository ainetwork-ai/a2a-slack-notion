import { NextResponse } from 'next/server';

// TODO: port workspace invites — the Hono source depended on a prisma
// `workspaceInvite` model and `workspaces.icon` column that do not exist in
// the shared Slack schema. Invite creation requires schema work first.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Workspace invites are not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
