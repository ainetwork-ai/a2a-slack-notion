import { NextResponse } from 'next/server';

// TODO: port agents/revise — not portable without additional work.
//
// The original Hono route called `invokeRevisionStream(agentId, {...})` from
// `../lib/a2a/agent-invoker.js`, which streamed revision chunks over SSE with a
// Notion-specific payload (pageId, workspaceId, commentId, originalText,
// instruction). The Slack lib at
// `/mnt/newdata/git/slack-a2a/slack/src/lib/a2a/` does not expose a revision
// helper — `sendToAgent` and `streamAgentResponse` in `message-bridge.ts`
// operate on Slack channel/DM messages, not Notion comments, and do not accept
// an `originalText`+`instruction` pair. Porting this route requires
// re-introducing an agent-invoker (or a Notion-flavoured equivalent).
export async function POST() {
  return NextResponse.json(
    {
      object: 'error',
      status: 501,
      code: 'not_implemented',
      message:
        'Agent revision is not yet ported — requires an invokeRevisionStream helper that does not exist in the Slack lib',
    },
    { status: 501 },
  );
}
