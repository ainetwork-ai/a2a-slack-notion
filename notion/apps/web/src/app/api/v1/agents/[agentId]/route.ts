import { NextResponse } from 'next/server';

// TODO: port single-agent GET/DELETE — depends on ../lib/a2a/* and prisma shim.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent detail is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent removal is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
