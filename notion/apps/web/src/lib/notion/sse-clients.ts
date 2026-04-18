/**
 * Simple in-process SSE client registry.
 * Maps userId -> Set of write functions (one per active SSE connection).
 * Sufficient for 1-20 user teams on a single server process.
 */
export type SseWriter = (chunk: string) => void;

export const sseClients = new Map<string, Set<SseWriter>>();

export function addSseClient(userId: string, writer: SseWriter): () => void {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId)!.add(writer);

  return () => {
    const set = sseClients.get(userId);
    if (set) {
      set.delete(writer);
      if (set.size === 0) sseClients.delete(userId);
    }
  };
}
