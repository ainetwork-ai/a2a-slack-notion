'use client';

import { useRouter, usePathname } from 'next/navigation';

import { Home, Search, Bell, MessageSquare, Smile, LogOut, Sun, Moon, Inbox } from 'lucide-react';
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
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          onClick={onClick}
          className={cn(
            'relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150',
            active
              ? 'bg-white text-[#1a1d21]'
              : 'text-[#bcabbc] hover:bg-white/10 hover:text-white'
          )}
        >
          {icon}
          {badge && badge > 0 ? (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { setSearchOpen, searchOpen } = useAppStore();
  const { theme, toggleTheme } = useThemeStore();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="sidebar-dark flex flex-col items-center w-16 h-full py-3 gap-1 border-r border-white/5 shrink-0">
      {/* Workspace Logo */}
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#4a154b] mb-1 cursor-pointer shadow-md hover:bg-[#611f6a] transition-colors"
            onClick={() => router.push('/workspace')}
          >
            <span className="text-white font-bold text-xs">A2A</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#1a1d21] text-white border-white/10">
            Slack-A2A
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="w-8 border-t border-white/10 mb-2 mt-2" />

      {/* Nav Buttons */}
      <NavButton
        icon={<Home className="w-5 h-5" />}
        label="Home"
        onClick={() => router.push('/workspace')}
        active={pathname === '/workspace'}
      />
      <NavButton
        icon={<Search className="w-5 h-5" />}
        label="Search (Cmd+K)"
        onClick={() => setSearchOpen(true)}
        active={searchOpen}
      />
      <NavButton
        icon={<Bell className="w-5 h-5" />}
        label="Notifications"
        onClick={() => {}}
        badge={unreadCount}
      />
      <NavButton
        icon={<MessageSquare className="w-5 h-5" />}
        label="Direct Messages"
        onClick={() => router.push('/workspace')}
      />
      <NavButton
        icon={<Inbox className="w-5 h-5" />}
        label="All unreads"
        onClick={() => router.push('/workspace/unreads')}
        active={pathname === '/workspace/unreads'}
      />

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
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[#1a1d21]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" sideOffset={8} className="w-56 bg-[#1a1d21] border-white/10 text-white">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-white">
              <div className="font-semibold">{user?.displayName ?? 'You'}</div>
              <div className="text-xs text-slate-400 truncate">
                {user?.ainAddress ? `${user.ainAddress.slice(0, 6)}…${user.ainAddress.slice(-4)}` : ''}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            className="text-slate-200 focus:bg-white/10 focus:text-white cursor-pointer"
            onClick={async () => {
              const text = prompt('Set your status message:');
              if (text !== null) {
                await fetch('/api/presence', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ statusMessage: text }),
                });
              }
            }}
          >
            <Smile className="w-4 h-4" />
            Set status
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
  );
}
