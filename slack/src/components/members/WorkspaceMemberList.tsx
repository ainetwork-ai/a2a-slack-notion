'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { InviteModal } from '@/components/notion/workspace/invite-modal';
import { ListSkeleton } from '@/components/notion/sidebar/list-skeleton';

/**
 * Workspace-level member list, usable from both the slack sidebar and the
 * Notion sidebar. Both surfaces use the same underlying `workspaceMembers`
 * table via `/api/v1/workspaces/<id>/members`. The legacy slack
 * `/api/workspaces/<id>/members` endpoint exists with a different shape
 * (`{ members, channelCount }`) and is consumed by the workspace settings
 * page; we keep both so neither caller breaks.
 */
export interface WorkspaceMember {
  id: string;
  role: 'admin' | 'member' | 'guest' | 'owner';
  joinedAt: string;
  user: {
    id: string;
    name: string;
    image: string | null;
    walletAddress: string;
    isAgent?: boolean;
  };
}

interface WorkspaceMemberListProps {
  workspaceId: string;
  /** Visual variant — Notion sidebar inline list vs. standalone panel. */
  variant?: 'sidebar' | 'panel';
  /** Hide agents from the list (default true to match Notion behaviour). */
  hideAgents?: boolean;
  /** Show the section heading. */
  showHeading?: boolean;
}

export function WorkspaceMemberList({
  workspaceId,
  variant = 'sidebar',
  hideAgents = true,
  showHeading = true,
}: WorkspaceMemberListProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/members`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as WorkspaceMember[];
        setMembers(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/me', { credentials: 'include' });
      if (res.ok) {
        const me = (await res.json()) as { id: string };
        setCurrentUserId(me.id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadMembers().catch(() => {});
    loadCurrentUser().catch(() => {});
  }, [loadMembers, loadCurrentUser]);

  useEffect(() => {
    if (currentUserId && members.length > 0) {
      const me = members.find((m) => m.user.id === currentUserId);
      setCurrentUserRole(me?.role ?? null);
    }
  }, [currentUserId, members]);

  async function handleRemove(targetUserId: string) {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/members/${targetUserId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.user.id !== targetUserId));
      }
    } catch {
      /* ignore */
    }
  }

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';
  const visibleMembers = hideAgents
    ? members.filter((m) => !m.user.isAgent)
    : members;

  const containerClass =
    variant === 'panel'
      ? 'flex flex-col gap-1'
      : 'mt-4 px-2';

  return (
    <>
      <div className={containerClass}>
        {showHeading && (
          <div
            className={
              variant === 'panel'
                ? 'flex items-center justify-between mb-2'
                : 'flex items-center justify-between px-2 mb-1'
            }
          >
            <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Members
            </span>
            {isAdmin && (
              <button
                onClick={() => setModalOpen(true)}
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                title="Invite Member"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <ListSkeleton count={2} />
        ) : visibleMembers.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] px-2 py-1">
            No members yet
          </p>
        ) : (
          <div className="space-y-0.5">
            {visibleMembers.map((member) => (
              <div
                key={member.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] cursor-default"
              >
                <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--bg-hover)] flex items-center justify-center overflow-hidden">
                  {member.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.user.image}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <Users className="w-3 h-3 text-[var(--text-tertiary)]" />
                  )}
                </div>
                <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                  {member.user.name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] shrink-0 ${
                    member.role === 'admin' || member.role === 'owner'
                      ? 'bg-[var(--bg-blue)] text-[var(--accent-blue)]'
                      : member.role === 'guest'
                        ? 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'
                        : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                  }`}
                >
                  {member.role}
                </span>
                {isAdmin && member.user.id !== currentUserId && member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(member.user.id).catch(() => {})}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-red-500 transition-opacity duration-[var(--duration-micro)] shrink-0"
                    title="Remove member"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <InviteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
      />
    </>
  );
}
