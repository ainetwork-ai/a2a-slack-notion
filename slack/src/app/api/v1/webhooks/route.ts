import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/notion/db';
import { notionWebhooks } from '@/lib/db/schema';
import { getDefaultUser } from '@/lib/notion/auth';

const ALLOWED_EVENTS = [
  'page.created',
  'page.updated',
  'block.changed',
  'comment.added',
  'database.row_created',
] as const;

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(ALLOWED_EVENTS)).min(1),
});

export async function POST(request: NextRequest) {
  const user = await getDefaultUser();

  const body = await request.json();
  const parsed = CreateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { object: 'error', status: 400, code: 'validation_error', message: parsed.error.message },
      { status: 400 },
    );
  }

  const secret = randomBytes(32).toString('hex');

  const webhook = await db
    .insert(notionWebhooks)
    .values({
      userId: user.id,
      url: parsed.data.url,
      secret,
      events: parsed.data.events as unknown as string[],
    })
    .returning()
    .then((r) => r[0]!);

  return NextResponse.json(
    {
      object: 'webhook',
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      secret: webhook.secret,
      createdAt: webhook.createdAt,
    },
    { status: 201 },
  );
}

export async function GET() {
  const user = await getDefaultUser();

  const results = await db
    .select({
      id: notionWebhooks.id,
      url: notionWebhooks.url,
      events: notionWebhooks.events,
      active: notionWebhooks.active,
      createdAt: notionWebhooks.createdAt,
    })
    .from(notionWebhooks)
    .where(eq(notionWebhooks.userId, user.id))
    .orderBy(desc(notionWebhooks.createdAt));

  return NextResponse.json({ object: 'list', results });
}
