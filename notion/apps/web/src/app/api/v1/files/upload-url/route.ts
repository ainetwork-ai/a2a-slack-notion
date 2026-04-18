import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUploadUrl, fileKey } from '@/lib/notion/storage';
import { getDefaultUser } from '@/lib/notion/auth';

const UploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  workspaceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  await getDefaultUser();

  const body = await request.json();
  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const key = fileKey(parsed.data.workspaceId, parsed.data.fileName);
  const url = await getUploadUrl(key, parsed.data.contentType);

  return NextResponse.json({ url, key });
}
