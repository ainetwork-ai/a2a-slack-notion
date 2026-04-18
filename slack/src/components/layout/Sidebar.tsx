'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

import {
  Home, MessageSquare, Bell, Clock, Folder, FileText, Zap,
  LogOut, Sun, Moon, Smile, BellOff, Volume2, VolumeX, User, Plus,
} from 'lucide-react';
import Image from 'next/image';
import NotificationPanel from '@/components/modals/NotificationPanel';
import ProfileEditModal from '@/components/modals/ProfileEditModal';
import SetStatusModal from '@/components/modals/SetStatusModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/hooks/use-auth';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { useAppStore } from '@/lib/stores/app-store';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { usePresence } from '@/lib/realtime/use-presence';
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from '@/lib/notifications/notification-sound';
import { cn } from '@/lib/utils';

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}

function NavButton({ icon, label, onClick, active, badge }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-lg transition-all duration-150',
        active
          ? 'bg-white text-[#1a1d21]'
          : 'text-[#bcabbc] hover:bg-white/10 hover:text-white'
      )}
    >
      {icon}
      <span className="text-[10px] leading-tight font-medium">{label}</span>
      {badge && badge > 0 ? (
        <span className="absolute top-0.5 right-1 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { toggleNotificationPanel, notificationPanelOpen } = useAppStore();
  const { theme, toggleTheme } = useThemeStore();
  const { workspaces, activeWorkspaceName, setActive, fetchWorkspaces } = useWorkspaceStore();
  const { myStatus, setDnd, isDndEnabled } = usePresence();
  const [dndActive, setDndActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    setDndActive(isDndEnabled());
    setSoundEnabled(isNotificationSoundEnabled());
  }, []);

  function handleToggleDnd() {
    const next = !dndActive;
    setDndActive(next);
    setDnd(next);
  }

  function handleToggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setNotificationSoundEnabled(next);
  }

  function statusDotClass(): string {
    switch (myStatus) {
      case 'online': return 'bg-green-400';
      case 'dnd': return 'bg-red-500';
      case 'away':
      case 'idle': return 'bg-yellow-400';
      default: return 'bg-slate-500';
    }
  }

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const activeWorkspace = workspaces.find((w) => w.name === activeWorkspaceName);
  const otherWorkspaces = workspaces.filter((w) => w.name !== activeWorkspaceName);

  return (
    <>
    <ProfileEditModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    <SetStatusModal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} />
    <div className="sidebar-dark flex flex-col items-center w-[68px] h-full py-3 gap-1 border-r border-white/5 shrink-0" role="navigation" aria-label="Main navigation">

      {/* Active Workspace Icon */}
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#4a154b] mb-1 cursor-pointer shadow-md hover:bg-[#611f6a] transition-colors overflow-hidden"
            onClick={() => router.push('/workspace')}
          >
            {activeWorkspace?.iconUrl ? (
              <Image
                src={activeWorkspace.iconUrl}
                alt={activeWorkspace.name}
                width={40}
                height={40}
                className="object-cover w-full h-full"
                unoptimized
              />
            ) : (
              <span className="text-white font-bold text-xs">
                {activeWorkspace?.iconText ?? 'A2A'}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
            {activeWorkspace?.name ?? 'Slack-A2A'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Other workspace icons */}
      {otherWorkspaces.map((ws) => (
        <TooltipProvider key={ws.id} delay={300}>
          <Tooltip>
            <TooltipTrigger
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#222529] cursor-pointer hover:bg-[#4a154b]/60 transition-colors border border-white/10 overflow-hidden"
              onClick={() => setActive(ws.name)}
            >
              {ws.iconUrl ? (
                <Image
                  src={ws.iconUrl}
                  alt={ws.name}
                  width={40}
                  height={40}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              ) : (
                <span className="text-white font-bold text-xs">{ws.iconText}</span>
              )}
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
              {ws.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      {/* Add workspace button */}
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-dashed border-white/20 cursor-pointer hover:border-white/40 hover:bg-white/5 transition-colors text-[#bcabbc] hover:text-white"
            onClick={async () => {
              const name = prompt('New workspace name:');
              if (!name) return;
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              const res = await fetch('/api/workspaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, slug }),
              });
              if (res.ok) {
                await fetchWorkspaces();
              }
            }}
          >
            <Plus className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
            Create workspace
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="w-8 border-t border-white/10 mb-2 mt-2" />

      {/* Nav Buttons — Slack-style icon + label */}
      <nav aria-label="App navigation" className="flex flex-col items-center gap-0.5 w-full px-1">
        <NavButton
          icon={<Home className="w-5 h-5" />}
          label="Home"
          onClick={() => router.push('/workspace')}
          active={pathname === '/workspace'}
        />
        <NavButton
          icon={<MessageSquare className="w-5 h-5" />}
          label="DMs"
          onClick={() => router.push('/workspace/dms')}
          active={pathname === '/workspace/dms' || pathname.startsWith('/workspace/dm/')}
        />
        {/* Activity — toggles NotificationPanel, no navigation */}
        <button
          aria-label="Activity"
          onClick={toggleNotificationPanel}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-lg transition-all duration-150',
            notificationPanelOpen
              ? 'bg-white text-[#1a1d21]'
              : 'text-[#bcabbc] hover:bg-white/10 hover:text-white'
          )}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[10px] leading-tight font-medium">Activity</span>
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-1 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <NavButton
          icon={<Zap className="w-5 h-5" />}
          label="Workflow"
          onClick={() => router.push('/workspace/workflows')}
          active={pathname === '/workspace/workflows'}
        />
        <NavButton
          icon={<Clock className="w-5 h-5" />}
          label="Later"
          onClick={() => router.push('/workspace/later')}
          active={pathname === '/workspace/later' || pathname === '/workspace/saved'}
        />
        <NavButton
          icon={<Folder className="w-5 h-5" />}
          label="Files"
          onClick={() => router.push('/workspace/files')}
          active={pathname === '/workspace/files'}
        />
        <NavButton
          icon={<FileText className="w-5 h-5" />}
          label="Canvases"
          onClick={() => router.push('/workspace/canvases')}
          active={pathname === '/workspace/canvases'}
        />
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme Toggle */}
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger
            onClick={toggleTheme}
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 text-[#bcabbc] hover:bg-white/10 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* User Avatar with dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="relative mt-2 focus:outline-none">
          <Avatar className="w-9 h-9 border-2 border-white/20 hover:border-white/40 transition-colors cursor-pointer">
            {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.displayName} />}
            <AvatarFallback className="bg-[#4a154b] text-white text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className={cn('absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1a1d21]', statusDotClass())} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" sideOffset={8} className="w-56 bg-[#1a1d21] border-white/10 text-white">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-white">
              <div className="font-semibold">{user?.displayName ?? 'You'}</div>
              {(user?.statusEmoji || user?.statusMessage) && (
                <div className="flex items-center gap-1 text-xs text-slate-300 mt-0.5">
                  {user.statusEmoji && <span>{user.statusEmoji}</span>}
                  {user.statusMessage && <span className="truncate">{user.statusMessage}</span>}
                </div>
              )}
              <div className="text-xs text-slate-400 truncate">
                {user?.ainAddress ? `${user.ainAddress.slice(0, 6)}…${user.ainAddress.slice(-4)}` : ''}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            className="text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer"
            onClick={() => setProfileModalOpen(true)}
          >
            <User className="w-4 h-4" />
            Edit profile
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer"
            onClick={() => setStatusModalOpen(true)}
          >
            <Smile className="w-4 h-4" />
            Set status
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              'focus:bg-white/10 cursor-pointer',
              dndActive ? 'text-red-400 focus:text-red-400' : 'text-slate-200 focus:text-white'
            )}
            onClick={handleToggleDnd}
          >
            <BellOff className="w-4 h-4" />
            {dndActive ? 'Turn off Do Not Disturb' : 'Do Not Disturb'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer"
            onClick={handleToggleSound}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? 'Mute notification sounds' : 'Unmute notification sounds'}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            className="text-red-400 focus:bg-white/10 focus:text-red-400 cursor-pointer"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </>
  );
}
