'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Home, MessageSquare, Bell, Clock, Folder, Zap, MoreHorizontal } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  onOpenSidebar: () => void;
}

export default function MobileNav({ onOpenSidebar }: MobileNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toggleNotificationPanel, notificationPanelOpen } = useAppStore();

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="w-5 h-5" />,
      active: pathname === '/workspace',
      onClick: () => router.push('/workspace'),
    },
    {
      id: 'dms',
      label: 'DMs',
      icon: <MessageSquare className="w-5 h-5" />,
      active: pathname === '/workspace/dms' || pathname.startsWith('/workspace/dm/'),
      onClick: () => router.push('/workspace/dms'),
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: <Bell className="w-5 h-5" />,
      active: notificationPanelOpen,
      onClick: toggleNotificationPanel,
    },
    {
      id: 'later',
      label: 'Later',
      icon: <Clock className="w-5 h-5" />,
      active: pathname === '/workspace/later' || pathname === '/workspace/saved',
      onClick: () => router.push('/workspace/later'),
    },
    {
      id: 'more',
      label: 'More',
      icon: <MoreHorizontal className="w-5 h-5" />,
      active: false,
      onClick: onOpenSidebar,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-14 border-t border-white/10 bg-[#1a1d21] md:hidden"
      aria-label="Mobile navigation"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={tab.onClick}
          className={cn(
            'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors',
            tab.active
              ? 'text-[#e879f9]'
              : 'text-slate-400 hover:text-white'
          )}
          aria-label={tab.label}
        >
          {tab.icon}
          <span className="text-[10px]">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
