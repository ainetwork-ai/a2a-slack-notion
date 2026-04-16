'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { InviteModal } from '@/components/workspace/invite-modal';

interface MemberUser {
  id: string;
  name: string;
  image: string | null;
  walletAddress: string;
  isAgent?: boolean;
}

interface MemberItem {
  id: string;
  role: 'admin' | 'member' | 'guest';
  joinedAt: string;
  user: MemberUser;
}

interface MemberListProps {
  workspaceId: string;
}

export function MemberList({ workspaceId }: MemberListProps) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const apiUrl =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`)
      : 'http://localhost:3011';

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/members`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as MemberItem[];
        setMembers(data);
      }
    } catch {
      /* ignore */
    }
  }, [apiUrl, workspaceId]);

  const loadCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/v1/me`, { credentials: 'include' });
      if (res.ok) {
        const me = (await res.json()) as { id: string };
        setCurrentUserId(me.id);
      }
    } catch {
      /* ignore */
    }
  }, [apiUrl]);

  useEffect(() => {
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
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceId}/members/${targetUserId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.user.id !== targetUserId));
      }
    } catch {
      /* ignore */
    }
  }

  const isAdmin = currentUserRole === 'admin';

  return (
    <>
      <div className="mt-4 px-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Members</span>
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

        {members.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] px-2 py-1">No members yet</p>
        ) : (
          <div className="space-y-0.5">
            {members.filter((m) => !m.user.isAgent).map((member) => (
              <div
                key={member.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] cursor-default"
              >
                <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--bg-hover)] flex items-center justify-center overflow-hidden">
                  {member.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.user.image} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <Users className="w-3 h-3 text-[var(--text-tertiary)]" />
                  )}
                </div>
                <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{member.user.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] shrink-0 ${
                    member.role === 'admin'
                      ? 'bg-[var(--bg-blue)] text-[var(--accent-blue)]'
                      : member.role === 'guest'
                      ? 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]'
                      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                  }`}
                >
                  {member.role}
                </span>
                {isAdmin && member.user.id !== currentUserId && (
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
