import { NextResponse, type NextRequest } from 'next/server';
import { getDownloadUrl } from '@/lib/notion/storage';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET(request: NextRequest) {
  await getDefaultUser();

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: 'key required' },
      { status: 400 },
    );
  }

  const downloadUrl = await getDownloadUrl(key);
  return NextResponse.json({ url: downloadUrl });
}
