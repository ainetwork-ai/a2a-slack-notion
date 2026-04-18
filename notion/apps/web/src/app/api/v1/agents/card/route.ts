import { NextResponse } from 'next/server';

// TODO: port agents/card — depends on ../lib/a2a/* client modules.
export async function GET() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent card preview is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
