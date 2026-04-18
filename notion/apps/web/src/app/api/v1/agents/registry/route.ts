import { NextResponse } from 'next/server';

// TODO: port agents/registry — depends on ../lib/a2a/* modules.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent registry is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
