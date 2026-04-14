'use client';

import { useState, useCallback, useRef } from 'react';

export function useAgentStream() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = useCallback((agentId: string, text: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setContent('');
    setError(null);
    setIsStreaming(true);

    const url = `/api/agents/stream?agentId=${encodeURIComponent(agentId)}&text=${encodeURIComponent(text)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsStreaming(false);
        es.close();
        eventSourceRef.current = null;
        return;
      }
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.content) {
          setContent(prev => prev + parsed.content);
        }
      } catch {
        setContent(prev => prev + event.data);
      }
    };

    es.onerror = () => {
      setError('Stream connection failed');
      setIsStreaming(false);
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return { content, isStreaming, error, startStream, stopStream };
}
