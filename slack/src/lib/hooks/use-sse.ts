'use client';

import { useEffect, useRef, useCallback } from 'react';
import { mutate } from 'swr';

interface SSEMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface UseSSEOptions {
  onMessage?: (event: SSEMessage) => void;
  onNotification?: (event: SSEMessage) => void;
  onTyping?: (event: SSEMessage) => void;
  onPresence?: (event: SSEMessage) => void;
  enabled?: boolean;
}

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useSSE(options: UseSSEOptions = {}) {
  const { onMessage, onNotification, onTyping, onPresence, enabled = true } = options;
  const esRef = useRef<EventSource | null>(null);
  const retryDelayRef = useRef(BASE_DELAY);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const handlersRef = useRef({ onMessage, onNotification, onTyping, onPresence });
  handlersRef.current = { onMessage, onNotification, onTyping, onPresence };

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    const es = new EventSource('/api/events');
    esRef.current = es;

    es.addEventListener('connected', () => {
      retryDelayRef.current = BASE_DELAY;
    });

    es.addEventListener('message', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // Trigger SWR revalidation for the relevant channel/DM
        if (data.channelId) {
          mutate(`/api/channels/${data.channelId}/messages`);
        } else if (data.conversationId) {
          mutate(`/api/dm/${data.conversationId}/messages`);
        }
        handlersRef.current.onMessage?.({ type: 'message', data });
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('notification', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // Trigger SWR revalidation for notifications
        mutate('/api/notifications');
        handlersRef.current.onNotification?.({ type: 'notification', data });
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('typing', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        handlersRef.current.onTyping?.({ type: 'typing', data });
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('presence', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        handlersRef.current.onPresence?.({ type: 'presence', data });
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;

      if (!mountedRef.current) return;

      // Exponential backoff reconnect
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_DELAY);

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [enabled, connect]);
}
