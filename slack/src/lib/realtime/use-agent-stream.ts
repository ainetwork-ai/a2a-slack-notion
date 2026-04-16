'use client';

import { useState, useCallback, useRef } from 'react';

interface StreamParams {
  agentId: string;
  text: string;
  channelId?: string;
  conversationId?: string;
  skillId?: string;
  senderName?: string;
}

export function useAgentStream() {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStream = useCallback((params: StreamParams | string, textOrUndefined?: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setContent('');
    setStatus(null);
    setError(null);
    setIsStreaming(true);

    // Support both old (agentId, text) and new (params object) signatures
    let urlParams: URLSearchParams;
    if (typeof params === 'string') {
      urlParams = new URLSearchParams({
        agentId: params,
        text: textOrUndefined || '',
      });
    } else {
      urlParams = new URLSearchParams({ agentId: params.agentId, text: params.text });
      if (params.channelId) urlParams.set('channelId', params.channelId);
      if (params.conversationId) urlParams.set('conversationId', params.conversationId);
      if (params.skillId) urlParams.set('skillId', params.skillId);
      if (params.senderName) urlParams.set('senderName', params.senderName);
    }

    const url = `/api/agents/stream?${urlParams.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsStreaming(false);
        setStatus(null);
        es.close();
        eventSourceRef.current = null;
        return;
      }
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'content' && parsed.content) {
          setContent(prev => prev + parsed.content);
          setStatus(null);
        } else if (parsed.type === 'status' && parsed.content) {
          setStatus(parsed.content);
        } else if (parsed.type === 'error') {
          setError(parsed.content || 'Stream error');
          setIsStreaming(false);
        } else if (parsed.content) {
          // Legacy format
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
    setStatus(null);
  }, []);

  const reset = useCallback(() => {
    setContent('');
    setStatus(null);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { content, status, isStreaming, error, startStream, stopStream, reset };
}
