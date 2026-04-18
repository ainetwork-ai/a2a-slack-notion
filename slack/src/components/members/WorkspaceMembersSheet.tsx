'use client';

import { X, Users } from 'lucide-react';
import { WorkspaceMemberList } from './WorkspaceMemberList';

interface WorkspaceMembersSheetProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  workspaceName?: string | null;
}

/**
 * Slide-over sheet that renders the shared <WorkspaceMemberList>. Used by
 * the slack channel sidebar so users can view workspace-wide members
 * (separate from the per-channel member list in ChannelDetailPanel).
 */
export function WorkspaceMembersSheet({
  open,
  onClose,
  workspaceId,
  workspaceName,
}: WorkspaceMembersSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace members"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Right-aligned panel */}
      <div
        className="ml-auto relative h-full w-[360px] max-w-[100vw] flex flex-col bg-[var(--bg-default,#1a1d21)] shadow-2xl border-l border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary,#fff)]">
            <Users className="w-4 h-4 text-[var(--text-tertiary,#9ca3af)]" />
            <span>Members</span>
            {workspaceName && (
              <span className="text-[var(--text-tertiary,#9ca3af)] font-normal truncate max-w-[180px]">
                · {workspaceName}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close members panel"
            className="p-1 rounded hover:bg-white/10 text-[var(--text-tertiary,#9ca3af)] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {workspaceId ? (
            <WorkspaceMemberList
              workspaceId={workspaceId}
              variant="panel"
              hideAgents
              showHeading={false}
            />
          ) : (
            <p className="text-xs text-[var(--text-tertiary,#9ca3af)] px-2 py-4 text-center">
              No active workspace
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
