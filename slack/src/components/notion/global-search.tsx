'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { SearchModal } from './search-modal';
import { useWorkspaceStore } from '@/stores/workspace';

/**
 * GlobalSearch mounts at the app layout level and listens for Cmd+K / Ctrl+K.
 * It reads workspaceId from the URL params (available in /workspace/[workspaceId]/... routes).
 * Search open state is managed via the workspace store so the Sidebar can also trigger it.
 */
export function GlobalSearch() {
  const params = useParams<{ workspaceId?: string }>();
  const workspaceId = params?.workspaceId ?? '';
  const { searchOpen, setSearchOpen } = useWorkspaceStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (workspaceId) {
          setSearchOpen(true);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [workspaceId, setSearchOpen]);

  if (!workspaceId) return null;

  return (
    <SearchModal
      workspaceId={workspaceId}
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
    />
  );
}
