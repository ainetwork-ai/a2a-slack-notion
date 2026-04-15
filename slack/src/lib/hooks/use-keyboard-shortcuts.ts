'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/stores/app-store';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const {
    setActiveThread,
    setSearchOpen,
    setShortcutsModalOpen,
    toggleNotificationPanel,
    shortcutsModalOpen,
    notificationPanelOpen,
  } = useAppStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+Shift+A: Navigate to All DMs
      if (meta && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        router.push('/workspace');
        return;
      }

      // Cmd+Shift+T: Close thread panel
      if (meta && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setActiveThread(null);
        return;
      }

      // Cmd+Shift+K: Open DM quick switcher (search with people filter)
      if (meta && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Cmd+Shift+M: Toggle notification/activity panel
      if (meta && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        toggleNotificationPanel();
        return;
      }

      // Cmd+/: Show keyboard shortcuts help modal
      if (meta && e.key === '/') {
        e.preventDefault();
        setShortcutsModalOpen(true);
        return;
      }

      // Cmd+[: Navigate back
      if (meta && e.key === '[') {
        e.preventDefault();
        router.back();
        return;
      }

      // Cmd+]: Navigate forward
      if (meta && e.key === ']') {
        e.preventDefault();
        router.forward();
        return;
      }

      // Escape: Close any open panel/modal
      if (e.key === 'Escape') {
        if (shortcutsModalOpen) {
          setShortcutsModalOpen(false);
          return;
        }
        if (notificationPanelOpen) {
          toggleNotificationPanel();
          return;
        }
        setActiveThread(null);
        setSearchOpen(false);
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, setActiveThread, setSearchOpen, setShortcutsModalOpen, toggleNotificationPanel, shortcutsModalOpen, notificationPanelOpen]);
}
