import { NextResponse } from 'next/server';

// TODO: port agents/invoke — depends on ../lib/a2a/* invoker modules.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message: 'Agent invocation is not yet ported from the Hono API',
    },
    { status: 501 },
  );
}
