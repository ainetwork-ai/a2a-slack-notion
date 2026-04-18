'use client';

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

  // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
  const apiUrl = '';

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/invites/${token}`);
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
  }, [token, apiUrl]);

  async function handleJoin() {
    if (!invite) return;
    setState('joining');
    try {
      const res = await fetch(`${apiUrl}/api/v1/invites/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401) {
        // Public app — default-user middleware should always supply a user.
        // If we ever see 401, fall back to notion home (login page no longer exists).
        router.push('/notion');
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setState('error');
        setErrorMsg(data.message ?? 'Failed to join workspace.');
        return;
      }

      const data = (await res.json()) as { workspace: { id: string }; alreadyMember: boolean };
      router.replace(`/notion/workspace/${data.workspace.id}`);
    } catch {
      setState('error');
      setErrorMsg('Failed to connect to the server.');
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <div className="text-center max-w-[384px] px-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Invite Expired</h1>
          <p className="text-sm text-[var(--text-secondary)]">This invite link has expired. Ask a workspace admin to send a new one.</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
        <div className="text-center max-w-[384px] px-4">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Invalid Invite</h1>
          <p className="text-sm text-[var(--text-secondary)]">{errorMsg}</p>
          <button
            onClick={() => router.push('/notion')}
            className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--accent-blue)] text-white rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
      <div className="w-full max-w-[384px] px-4">
        <div className="bg-[var(--bg-sidebar)] rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-modal)] text-center">
          {/* Workspace icon */}
          <div className="w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            {invite.workspace.icon ? (
              <span className="text-3xl">{invite.workspace.icon}</span>
            ) : (
              <Users className="w-8 h-8 text-[var(--text-tertiary)]" />
            )}
          </div>

          <p className="text-sm text-[var(--text-tertiary)] mb-1">You've been invited to join</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{invite.workspace.name}</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            You'll join as a{' '}
            <span className="font-medium text-[var(--text-primary)]">{invite.role}</span>.
          </p>

          <button
            onClick={handleJoin}
            disabled={state === 'joining'}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium bg-[var(--accent-blue)] text-white rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {state === 'joining' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            Join Workspace
          </button>

          <button
            onClick={() => router.push('/notion')}
            className="mt-3 w-full py-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
