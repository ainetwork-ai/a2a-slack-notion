import { addSseClient } from '@/lib/notion/sse-clients';
import { getDefaultUser } from '@/lib/notion/auth';

export async function GET() {
  const user = await getDefaultUser();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      const cleanup = addSseClient(user.id, (chunk) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream closed
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          cleanup();
        }
      }, 30_000);

      // Clean up when closed
      const abort = () => {
        clearInterval(heartbeat);
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // Register cleanup via signal if available
      (controller as { signal?: AbortSignal }).signal?.addEventListener('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
