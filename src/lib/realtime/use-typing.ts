'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface TypingUser {
  userId: string;
  displayName: string;
}

export function useTyping(channelId?: string, conversationId?: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const contextParam = channelId
    ? `channelId=${channelId}`
    : conversationId
    ? `conversationId=${conversationId}`
    : null;

  // Poll typing status
  useEffect(() => {
    if (!contextParam) return;

    async function fetchTyping() {
      try {
        const res = await fetch(`/api/typing?${contextParam}`);
        if (!res.ok) return;
        const data = await res.json();
        setTypingUsers(data.typingUsers ?? []);
      } catch {
        // Ignore
      }
    }

    fetchTyping();
    pollRef.current = setInterval(fetchTyping, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [contextParam]);

  const reportTyping = useCallback(async () => {
    if (!contextParam) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      try {
        await fetch('/api/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, conversationId, isTyping: true }),
        });
      } catch {
        // Ignore
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      isTypingRef.current = false;
      try {
        await fetch('/api/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId, conversationId, isTyping: false }),
        });
      } catch {
        // Ignore
      }
    }, 3000);
  }, [contextParam, channelId, conversationId]);

  const stopTyping = useCallback(async () => {
    if (!contextParam || !isTypingRef.current) return;
    isTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    try {
      await fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, conversationId, isTyping: false }),
      });
    } catch {
      // Ignore
    }
  }, [contextParam, channelId, conversationId]);

  return { typingUsers, reportTyping, stopTyping };
}
