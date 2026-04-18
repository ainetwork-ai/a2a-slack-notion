import { NextResponse } from 'next/server';

// TODO: port agent health check — depends on ../lib/a2a/*.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent health check is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
