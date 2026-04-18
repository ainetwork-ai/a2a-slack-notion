import { NextResponse } from 'next/server';

// TODO: port agents list and invite — depend on ../lib/a2a/* modules and
// the prisma shim. Will be ported once the agent lib is migrated.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agents API is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agents API is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
