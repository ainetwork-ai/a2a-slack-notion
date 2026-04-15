import { createHmac } from 'node:crypto';
import { Worker, redisConnection } from '../lib/queue.js';
import { prisma } from '../lib/prisma.js';

export interface WebhookJobData {
  event: string;
  data: Record<string, unknown>;
}

export function startWebhookWorker() {
  const worker = new Worker<WebhookJobData>(
    'webhooks',
    async (job) => {
      const { event, data } = job.data;

      // Fetch all active webhooks subscribed to this event
      const activeWebhooks = await prisma.webhook.findMany({
        where: {
          active: true,
          events: { has: event },
        },
      });

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
            // Don't throw — this webhook delivery failed, others can succeed
          }
        }),
      );
      // Job always completes — individual webhook failures are logged but don't retry the whole batch
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[webhook-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
