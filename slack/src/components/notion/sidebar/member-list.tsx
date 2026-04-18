'use client';

import { useEffect } from 'react';
import { WorkspaceMemberList } from '@/components/members/WorkspaceMemberList';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';

interface MemberListProps {
  workspaceId: string;
}

/**
 * Notion sidebar Members section. Delegates rendering to the shared
 * <WorkspaceMemberList> so the slack workspace-members panel and the Notion
 * sidebar list stay visually in sync.
 *
 * As a side effect, this also syncs the slack workspace store with the
 * current Notion workspace id so that switching back to slack preserves the
 * user's "active workspace" context (Phase 1.1 unification).
 */
export function MemberList({ workspaceId }: MemberListProps) {
  const setActiveById = useWorkspaceStore((s) => s.setActiveById);

  useEffect(() => {
    if (workspaceId) {
      setActiveById(workspaceId);
    }
  }, [workspaceId, setActiveById]);

  return (
    <WorkspaceMemberList
      workspaceId={workspaceId}
      variant="sidebar"
      hideAgents
      showHeading
    />
  );
}
