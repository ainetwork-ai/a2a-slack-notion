'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock, HelpCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/lib/stores/app-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAuth } from '@/lib/hooks/use-auth';
import { usePresence, UserStatus } from '@/lib/realtime/use-presence';
import { cn } from '@/lib/utils';
import TopBarSearch from './TopBarSearch';

function statusDotClass(status: UserStatus): string {
  switch (status) {
    case 'online':
      return 'bg-green-400';
    case 'dnd':
      return 'bg-red-500';
    case 'away':
    case 'idle':
      return 'bg-yellow-400';
    default:
      return 'bg-slate-500';
  }
}

export default function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { setSearchOpen, setShortcutsModalOpen } = useAppStore();
  const { workspaces, activeWorkspaceName } = useWorkspaceStore();
  const { myStatus } = usePresence();

  const activeWorkspace = workspaces.find((w) => w.name === activeWorkspaceName);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  // Approximate back/forward availability — browser exposes history.length
  // but not position, so we best-effort disable the arrows when clearly empty.
  useEffect(() => {
    setCanBack(typeof window !== 'undefined' && window.history.length > 1);
    setCanForward(false); // forward state is opaque in browsers; keep dim unless user clicked back
  }, []);

  // `/` focuses the inline search input. Dispatches a focus request via a
  // custom event so we don't couple TopBar with TopBarSearch's ref. Skipped
  // when the user is already typing elsewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (target && target.isContentEditable) return;
      e.preventDefault();
      // Focus the first TopBar search input on the page.
      document
        .querySelector<HTMLInputElement>('[data-topbar-search] input')
        ?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div
      className="flex items-center h-11 px-2 shrink-0 border-b border-black/30"
      style={{ backgroundColor: '#3f0e40' }}
      role="banner"
    >
      {/* History nav + time indicator — takes ~25% */}
      <div className="flex items-center gap-1 w-1/4 min-w-0">
        <button
          onClick={() => router.back()}
          disabled={!canBack}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded text-white/80 transition-colors',
            canBack ? 'hover:bg-white/10 hover:text-white' : 'opacity-40 cursor-default'
          )}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={() => {
            setCanForward(false);
            router.forward();
          }}
          disabled={!canForward}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded text-white/80 transition-colors',
            canForward ? 'hover:bg-white/10 hover:text-white' : 'opacity-40 cursor-default'
          )}
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRight className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          title="Recent"
          aria-label="Recent"
        >
          <Clock className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Search — takes ~50% */}
      <div
        data-topbar-search
        className="flex-1 flex items-center justify-center"
      >
        <TopBarSearch
          workspaceId={activeWorkspace?.id ?? null}
          placeholder={`Search ${activeWorkspace?.name ?? 'workspace'}`}
        />
      </div>

      {/* Right cluster — help + user */}
      <div className="flex items-center gap-1 w-1/4 justify-end min-w-0">
        <button
          onClick={() => setShortcutsModalOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          title="Help & shortcuts"
          aria-label="Help"
        >
          <HelpCircle className="w-[18px] h-[18px]" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className="relative flex items-center gap-1 h-8 px-1 rounded hover:bg-white/10 transition-colors focus:outline-none">
            <Avatar className="w-7 h-7">
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.displayName} />}
              <AvatarFallback className="bg-[#611f6a] text-white text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border border-[#3f0e40]',
                statusDotClass(myStatus)
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-[#222529] border-white/10 text-white">
            <div className="px-2 py-1.5">
              <p className="text-sm font-semibold">{user?.displayName ?? 'Signed in'}</p>
              {user?.ainAddress && (
                <p className="text-[10px] text-slate-500 font-mono truncate">{user.ainAddress}</p>
              )}
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={() => router.push('/workspace/settings')}
              className="cursor-pointer text-slate-300"
            >
              Preferences
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/workspace/settings/agents')}
              className="cursor-pointer text-slate-300"
            >
              Manage agents
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShortcutsModalOpen(true)}
              className="cursor-pointer text-slate-300"
            >
              Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-red-400 hover:text-red-300"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
