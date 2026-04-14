'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/stores/app-store';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { setActiveThread, setSearchOpen } = useAppStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+Shift+A: Navigate to All DMs
      if (meta && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        router.push('/workspace');
        return;
      }

      // Cmd+Shift+T: Navigate to Threads (close thread panel if open, or go to workspace)
      if (meta && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setActiveThread(null);
        return;
      }

      // Escape: Close any open panel
      if (e.key === 'Escape') {
        setActiveThread(null);
        setSearchOpen(false);
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, setActiveThread, setSearchOpen]);
}
