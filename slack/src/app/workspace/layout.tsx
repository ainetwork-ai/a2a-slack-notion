'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';
import Sidebar from '@/components/layout/Sidebar';
import { requestPermission } from '@/lib/notifications/browser-notify';
import ChannelList from '@/components/layout/ChannelList';
import DMList from '@/components/layout/DMList';
import AgentList from '@/components/layout/AgentList';
import SearchModal from '@/components/modals/SearchModal';
import CreateChannelModal from '@/components/modals/CreateChannelModal';
import AgentInviteModal from '@/components/agent/AgentInviteModal';
import { Loader2, Menu, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 260;

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    const stored = localStorage.getItem('sidebarWidth');
    return stored ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(stored, 10))) : SIDEBAR_DEFAULT;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + delta));
    setSidebarWidth(newWidth);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setSidebarWidth(w => {
      localStorage.setItem('sidebarWidth', String(w));
      return w;
    });
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  function onDragHandleMouseDown(e: React.MouseEvent) {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1a1d21]">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-full overflow-hidden bg-[#1a1d21]">
      {/* Icon Sidebar */}
      <Sidebar />

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Channel Sidebar */}
      <div
        style={{ width: sidebarWidth }}
        className={[
          'relative flex flex-col shrink-0 bg-[#19171d] border-r border-white/5 overflow-hidden',
          // Mobile: fixed overlay; Desktop: normal flow
          'max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-30',
          'max-md:transition-transform max-md:duration-200 max-md:ease-in-out',
          sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        ].join(' ')}
      >
        {/* Workspace name */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0">
          <span className="font-bold text-white text-base truncate">Slack-A2A</span>
          {/* Close button — mobile only */}
          <button
            className="md:hidden text-slate-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 py-3 space-y-1 overflow-y-auto scrollbar-slack"
          onClick={(e) => {
            if (window.innerWidth < 768 && (e.target as HTMLElement).closest('a, button[data-nav], button')) {
              setSidebarOpen(false);
            }
          }}
        >
          <ChannelList />
          <Separator className="my-2 bg-white/5" />
          <DMList />
          <Separator className="my-2 bg-white/5" />
          <AgentList />
        </div>

        {/* E4: Drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-white/20 transition-colors z-10 hidden md:block"
          title="Drag to resize"
        />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 main-content overflow-hidden">
        {/* Mobile hamburger bar */}
        <div className="flex items-center h-10 px-3 border-b border-white/5 md:hidden shrink-0">
          <button
            className="text-slate-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-2 text-white font-semibold text-sm">Slack-A2A</span>
        </div>

        {children}
      </div>

      {/* Global modals */}
      <SearchModal />
      <CreateChannelModal />
      <AgentInviteModal />
    </div>
  );
}
