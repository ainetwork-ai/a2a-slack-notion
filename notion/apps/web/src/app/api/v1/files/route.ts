import { NextResponse, type NextRequest } from 'next/server';
import { deleteFile } from '@/lib/notion/storage';
import { getDefaultUser } from '@/lib/notion/auth';

export async function DELETE(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'key required' },
      { status: 400 },
    );
  }

  await deleteFile(key);
  return NextResponse.json({ object: 'file', key, deleted: true });
}
