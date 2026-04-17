import { Worker, redisConnection } from '../lib/queue.js';
import { db, notionNotifications } from '../lib/db.js';
import { sseClients } from '../lib/sse-clients.js';

export interface NotificationJobData {
  type: 'mention' | 'comment';
  userId: string;
  title: string;
  body?: string;
  pageId?: string;
}

export function startNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    'notifications',
    async (job) => {
      const { type, userId, title, body, pageId } = job.data;

      try {
        const notification = await db
          .insert(notionNotifications)
          .values({ userId, type, title, body, pageId })
          .returning()
          .then((r) => r[0]!);

        const writers = sseClients.get(userId);
        if (writers && writers.size > 0) {
          const payload = `data: ${JSON.stringify(notification)}\n\n`;
          for (const write of writers) {
            write(payload);
          }
        }
      } catch (err) {
        console.error('[notification-worker] Failed to process job:', err);
        throw err;
      }
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    console.error(`[notification-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
