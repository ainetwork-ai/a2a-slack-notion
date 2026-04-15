'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type UserStatus = 'online' | 'away' | 'idle' | 'dnd' | 'offline';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function usePresence() {
  const [userStatuses, setUserStatuses] = useState<Map<string, UserStatus>>(new Map());
  const [myStatus, setMyStatus] = useState<UserStatus>('online');
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const sendPresence = useCallback(async (status: UserStatus) => {
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Ignore heartbeat errors
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // If we were idle, come back to online (unless DND)
    const dndEnabled = typeof window !== 'undefined' && localStorage.getItem('dndEnabled') === 'true';
    if (!dndEnabled && myStatus === 'idle') {
      setMyStatus('online');
      sendPresence('online');
    }

    idleTimerRef.current = setTimeout(() => {
      const dnd = typeof window !== 'undefined' && localStorage.getItem('dndEnabled') === 'true';
      if (!dnd) {
        setMyStatus('idle');
        sendPresence('idle');
      }
    }, IDLE_TIMEOUT_MS);
  }, [myStatus, sendPresence]);

  useEffect(() => {
    const dndEnabled = typeof window !== 'undefined' && localStorage.getItem('dndEnabled') === 'true';
    const initialStatus: UserStatus = dndEnabled ? 'dnd' : 'online';
    setMyStatus(initialStatus);
    sendPresence(initialStatus);

    heartbeatRef.current = setInterval(() => {
      sendPresence(myStatus);
    }, 30000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Set up idle detection
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => resetIdleTimer();
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    // Start the idle timer
    resetIdleTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Keep heartbeat in sync with current status
  useEffect(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      sendPresence(myStatus);
    }, 30000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [myStatus, sendPresence]);

  function isOnline(userId: string) {
    const status = userStatuses.get(userId);
    return status === 'online' || status === 'dnd';
  }

  function getStatus(userId: string): UserStatus {
    return userStatuses.get(userId) ?? 'offline';
  }

  async function fetchPresence(userIds: string[]) {
    if (userIds.length === 0) return;
    try {
      const res = await fetch(`/api/presence?ids=${userIds.join(',')}`);
      if (!res.ok) return;
      const data = await res.json();
      const newStatuses = new Map<string, UserStatus>(userStatuses);
      for (const entry of data) {
        if (entry.id && entry.status) {
          newStatuses.set(entry.id, entry.status as UserStatus);
        }
      }
      setUserStatuses(newStatuses);
    } catch {
      // Ignore presence fetch errors
    }
  }

  async function setDnd(enabled: boolean) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dndEnabled', enabled ? 'true' : 'false');
    }
    const newStatus: UserStatus = enabled ? 'dnd' : 'online';
    setMyStatus(newStatus);
    await sendPresence(newStatus);
  }

  function isDndEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dndEnabled') === 'true';
  }

  return {
    userStatuses,
    myStatus,
    setUserStatuses,
    isOnline,
    getStatus,
    fetchPresence,
    setDnd,
    isDndEnabled,
  };
}
