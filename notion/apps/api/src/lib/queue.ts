import { Queue, Worker } from 'bullmq';

const connection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
  password: process.env['REDIS_PASSWORD'] || undefined,
};

export const notificationQueue = new Queue('notifications', { connection });
export const webhookQueue = new Queue('webhooks', { connection });

export { connection as redisConnection };
export { Worker };
