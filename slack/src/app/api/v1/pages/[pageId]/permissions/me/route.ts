import { NextResponse } from 'next/server';
import { getPagePermissionLevel } from '@/lib/notion/permissions';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const level = await getPagePermissionLevel(user.id, pageId);

  if (level === null) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'No access to this page' },
      { status: 403 },
    );
  }

  return NextResponse.json({ pageId, userId: user.id, level });
}
