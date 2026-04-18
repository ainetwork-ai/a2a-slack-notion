/**
 * Preview an agent card from a remote URL (without inviting).
 *
 * Ported from the deleted Hono `routes/agents.ts#GET /card`.
 */
import { NextResponse } from 'next/server';
import { getDefaultUser } from '@/lib/notion/auth';
import { fetchAgentCard } from '@/lib/a2a/client';

export async function GET(request: Request) {
  await getDefaultUser();

  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  try {
    const card = await fetchAgentCard(url);
    return NextResponse.json(card);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch agent card' }, { status: 400 });
  }
}
