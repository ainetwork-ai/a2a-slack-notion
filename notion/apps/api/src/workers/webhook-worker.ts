import { createHmac } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { Worker, redisConnection } from '../lib/queue.js';
import { db, notionWebhooks } from '../lib/db.js';

export interface WebhookJobData {
  event: string;
  data: Record<string, unknown>;
}

export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    'webhooks',
    async (job) => {
      const { event, data } = job.data;

      // `events` is a JSONB string[]; use `?` operator to test membership.
      const activeWebhooks = await db
        .select()
        .from(notionWebhooks)
        .where(
          and(
            eq(notionWebhooks.active, true),
            sql`${notionWebhooks.events} ? ${event}`,
          ),
        );

      if (activeWebhooks.length === 0) return;

      const timestamp = new Date().toISOString();
      const body = JSON.stringify({ event, data, timestamp });

      await Promise.allSettled(
        activeWebhooks.map(async (webhook) => {
          try {
            const signature = createHmac('sha256', webhook.secret)
              .update(body)
              .digest('hex');

            const res = await fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${signature}`,
              },
              body,
              signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) {
              console.error(`[webhook-worker] Failed to deliver to ${webhook.url}: HTTP ${res.status}`);
            }
          } catch (err) {
            console.error(`[webhook-worker] Failed to deliver to ${webhook.url}:`, err);
          }
        }),
      );
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[webhook-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
