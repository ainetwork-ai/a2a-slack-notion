'use client';

import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, Users, Bell, Menu } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';

interface MobileNavProps {
  onOpenSidebar: () => void;
}

export default function MobileNav({ onOpenSidebar }: MobileNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toggleNotificationPanel, notificationPanelOpen } = useAppStore();
  const { activeWorkspaceId } = useWorkspaceStore();

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: <MessageSquare className="w-5 h-5" />,
      active: pathname === '/workspace' || pathname.startsWith('/workspace/channel') || pathname.startsWith('/workspace/dm'),
      onClick: () => {
        if (activeWorkspaceId) {
          router.push('/workspace');
        } else {
          router.push('/workspace');
        }
      },
    },
    {
      id: 'dms',
      label: 'DMs',
      icon: <Users className="w-5 h-5" />,
      active: false,
      onClick: () => {
        const dmSection = document.querySelector('[data-section="dm"]');
        if (dmSection) dmSection.scrollIntoView({ behavior: 'smooth' });
        onOpenSidebar();
      },
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: <Bell className="w-5 h-5" />,
      active: notificationPanelOpen,
      onClick: toggleNotificationPanel,
    },
    {
      id: 'more',
      label: 'More',
      icon: <Menu className="w-5 h-5" />,
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
            'flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-xs transition-colors',
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
