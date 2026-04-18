import { NextResponse, type NextRequest } from 'next/server';
import { appEvents, type MentionEvent } from '@/lib/notion/events';
import { getDefaultUser } from '@/lib/notion/auth';
import '@/lib/notion/event-handlers';

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = (await request.json()) as {
    type: 'user' | 'page' | 'date';
    targetId: string;
    pageId: string;
    blockId: string;
  };

  const { type, targetId, pageId, blockId } = body;
  if (!type || !targetId || !pageId || !blockId) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'type, targetId, pageId, blockId required' },
      { status: 400 },
    );
  }

  const event: MentionEvent = {
    type,
    targetId,
    pageId,
    blockId,
    mentionedBy: user.id,
  };

  appEvents.emit('mention.created', event);

  return NextResponse.json({ ok: true });
}
