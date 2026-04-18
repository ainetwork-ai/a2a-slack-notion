import { NextResponse } from 'next/server';

// TODO: port agent skills list — depends on ../lib/a2a/*.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent skills list is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
