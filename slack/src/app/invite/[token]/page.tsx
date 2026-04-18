'use client';

/**
 * Unified invite-accept page.
 *
 * Both Slack and Notion now produce invite links pointing here:
 *   ${origin}/invite/<token>
 *
 * The `inviteTokens` table is shared. The user becomes a
 * workspaceMembers row on accept, which grants access to both the
 * Slack side (channels in that workspace) and the Notion side
 * (pages + databases in that workspace) automatically.
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';

interface InviteInfo {
  token: string;
  role: string;
  expiresAt: string | null;
  workspace: {
    id: string;
    name: string;
    icon: string | null;
  };
}

type PageState = 'loading' | 'ready' | 'joining' | 'error' | 'expired';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params['token'] as string;

  const [state, setState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/v1/invites/${token}`);
        if (res.status === 404) {
          setState('error');
          setErrorMsg('This invite link is invalid or has been removed.');
          return;
        }
        if (res.status === 410) {
          setState('expired');
          return;
        }
        if (!res.ok) {
          setState('error');
          setErrorMsg('Could not load invite details.');
          return;
        }
        const data = (await res.json()) as InviteInfo;
        setInvite(data);
        setState('ready');
      } catch {
        setState('error');
        setErrorMsg('Failed to connect to the server.');
      }
    })();
  }, [token]);

  async function handleJoin() {
    if (!invite) return;
    setState('joining');
    try {
      const res = await fetch(`/api/v1/invites/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { message?: string }));
        setState('error');
        setErrorMsg(data.message ?? 'Failed to join workspace.');
        return;
      }

      // Land in Slack view of the workspace by default — channels are the
      // more common entry point. If the user wants Notion, they can switch
      // via the rail once inside.
      router.replace(`/workspace`);
    } catch {
      setState('error');
      setErrorMsg('Failed to connect to the server.');
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1d21]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1d21]">
        <div className="text-center max-w-sm px-4">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Invite Expired</h1>
          <p className="text-sm text-slate-400">
            This invite link has expired. Ask a workspace admin to send a new one.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1d21]">
        <div className="text-center max-w-sm px-4">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Invalid Invite</h1>
          <p className="text-sm text-slate-400">{errorMsg}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 text-sm font-medium bg-[#4a154b] text-white rounded-md hover:opacity-90 transition-opacity"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1d21]">
      <div className="w-full max-w-sm px-4">
        <div className="bg-[#222529] rounded-xl p-8 shadow-2xl text-center border border-white/10">
          <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            {invite.workspace.icon ? (
              <span className="text-3xl">{invite.workspace.icon}</span>
            ) : (
              <Users className="w-8 h-8 text-slate-400" />
            )}
          </div>

          <p className="text-sm text-slate-400 mb-1">You&apos;ve been invited to join</p>
          <h1 className="text-2xl font-bold text-white mb-2">{invite.workspace.name}</h1>
          <p className="text-sm text-slate-400 mb-6">
            You&apos;ll join as a{' '}
            <span className="font-medium text-white">{invite.role}</span>.
          </p>

          <button
            onClick={handleJoin}
            disabled={state === 'joining'}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium bg-[#4a154b] hover:bg-[#611f6a] text-white rounded-md disabled:opacity-50 transition-colors"
          >
            {state === 'joining' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            Join Workspace
          </button>

          <button
            onClick={() => router.push('/')}
            className="mt-3 w-full py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
