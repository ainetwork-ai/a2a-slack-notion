'use client';

import { useState, useEffect, useRef } from 'react';

export function usePresence() {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function sendHeartbeat() {
      try {
        await fetch('/api/presence', { method: 'POST' });
      } catch {
        // Ignore heartbeat errors
      }
    }

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  function isOnline(userId: string) {
    return onlineUsers.has(userId);
  }

  async function fetchPresence(userIds: string[]) {
    if (userIds.length === 0) return;
    try {
      const res = await fetch(`/api/presence?ids=${userIds.join(',')}`);
      if (!res.ok) return;
      const data = await res.json();
      const onlineIds: string[] = data.onlineIds ?? [];
      setOnlineUsers(new Set(onlineIds));
    } catch {
      // Ignore presence fetch errors
    }
  }

  return {
    onlineUsers,
    setOnlineUsers,
    isOnline,
    fetchPresence,
  };
}
