import { NextResponse } from 'next/server';

// TODO: port agents/revise — depends on ../lib/a2a/* invoker modules.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent revision is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
