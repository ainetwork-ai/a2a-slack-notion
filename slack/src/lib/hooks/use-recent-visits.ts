'use client';

import { useCallback, useEffect, useState } from 'react';

export interface RecentVisit {
  type: 'channel' | 'dm';
  id: string; // channel name or dm conversation id
  label: string; // display label (channel name or DM peer name)
  isPrivate?: boolean;
  visitedAt: number;
}

const KEY = 'slack-a2a-recent-visits';
const MAX_VISITS = 15;

function readAll(): RecentVisit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAll(list: RecentVisit[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_VISITS)));
}

export function pushRecentVisit(visit: Omit<RecentVisit, 'visitedAt'>) {
  const all = readAll();
  const filtered = all.filter((v) => !(v.type === visit.type && v.id === visit.id));
  const next = [{ ...visit, visitedAt: Date.now() }, ...filtered];
  writeAll(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('recent-visits-changed'));
  }
}

export function clearRecentVisits() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('recent-visits-changed'));
}

export function useRecentVisits(limit = 10): RecentVisit[] {
  const [visits, setVisits] = useState<RecentVisit[]>([]);

  const refresh = useCallback(() => {
    setVisits(readAll().slice(0, limit));
  }, [limit]);

  useEffect(() => {
    refresh();
    function onChange() {
      refresh();
    }
    window.addEventListener('recent-visits-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('recent-visits-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  return visits;
}
