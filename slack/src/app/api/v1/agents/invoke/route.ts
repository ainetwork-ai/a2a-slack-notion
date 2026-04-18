import { NextResponse } from 'next/server';

// TODO: port agents/invoke — not portable without additional work.
//
// The original Hono route depended on `invokeAgent` and `invokeAgentStream`
// from `../lib/a2a/agent-invoker.js`. Neither that file nor equivalent exported
// helpers exist in the Slack lib at
// `/mnt/newdata/git/slack-a2a/slack/src/lib/a2a/`. The closest analogue is
// `sendToAgent()` in `message-bridge.ts`, but it writes a persisted Slack
// message and does not accept the `pageId` / `blockId` Notion-context fields
// the original relied on, and it has no streaming counterpart that yields the
// `{ type, content }` SSE chunks Notion's frontend expects. Porting requires
// either (a) restoring the original agent-invoker or (b) adapting
// `message-bridge` to emit Notion-shaped streaming events.
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message:
        'Agent invocation is not yet ported — requires an agent-invoker helper that does not exist in the Slack lib',
    },
    { status: 501 },
  );
}
