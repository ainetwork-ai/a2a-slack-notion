import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { blocks } from '@slack-db/schema';
import { getDefaultUser } from '@/lib/notion/auth';
import { checkPagePermission } from '@/lib/notion/permissions';
import { pageToMarkdown } from '@/lib/notion/export-markdown';
import { databaseToCsv } from '@/lib/notion/export-csv';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const user = await getDefaultUser();
  const { pageId } = await params;

  const ok = await checkPagePermission(user.id, pageId, 'can_view');
  if (!ok) {
    return NextResponse.json(
      { object: 'error', status: 403, code: 'forbidden', message: 'Insufficient permission' },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'markdown';

  const page = await db
    .select({ id: blocks.id, type: blocks.type, properties: blocks.properties })
    .from(blocks)
    .where(and(eq(blocks.id, pageId), eq(blocks.archived, false)))
    .limit(1)
    .then((r) => r[0]);

  if (!page) {
    return NextResponse.json(
      { object: 'error', status: 404, code: 'not_found', message: 'Page not found' },
      { status: 404 },
    );
  }

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const title = ((props['title'] as string) ?? 'untitled')
    .replace(/[^a-z0-9_\-]/gi, '_')
    .toLowerCase();

  if (format === 'markdown') {
    let md: string;
    try {
      md = await pageToMarkdown(pageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      return NextResponse.json(
        { object: 'error', status: 500, code: 'export_error', message: msg },
        { status: 500 },
      );
    }

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${title}.md"`,
      },
    });
  }

  if (format === 'csv') {
    if (page.type !== 'database') {
      return NextResponse.json(
        {
          object: 'error',
          status: 400,
          code: 'invalid_format',
          message: 'CSV export is only supported for database blocks',
        },
        { status: 400 },
      );
    }

    let csv: string;
    try {
      csv = await databaseToCsv(pageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      return NextResponse.json(
        { object: 'error', status: 500, code: 'export_error', message: msg },
        { status: 500 },
      );
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${title}.csv"`,
      },
    });
  }

  return NextResponse.json(
    {
      object: 'error',
      status: 400,
      code: 'invalid_format',
      message: 'Unsupported format. Use ?format=markdown or ?format=csv',
    },
    { status: 400 },
  );
}
