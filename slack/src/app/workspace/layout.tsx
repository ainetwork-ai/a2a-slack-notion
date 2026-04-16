'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/use-auth';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import MobileNav from '@/components/layout/MobileNav';
import { requestPermission } from '@/lib/notifications/browser-notify';
import ChannelList from '@/components/layout/ChannelList';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useAppStore } from '@/lib/stores/app-store';
import DMList from '@/components/layout/DMList';
import AgentList from '@/components/layout/AgentList';
import McpList from '@/components/layout/McpList';
import McpTestbed from '@/components/mcp/McpTestbed';
import AgentTestPane from '@/components/mcp/AgentTestPane';
import SearchModal from '@/components/modals/SearchModal';
import CreateChannelModal from '@/components/modals/CreateChannelModal';
import BrowseChannelsModal from '@/components/modals/BrowseChannelsModal';
import AgentInviteModal from '@/components/agent/AgentInviteModal';
import AgentBuildModal from '@/components/agent/AgentBuildModal';
import WorkspaceModal from '@/components/modals/WorkspaceModal';
import KeyboardShortcutsModal from '@/components/modals/KeyboardShortcutsModal';
import ConnectionStatus from '@/components/layout/ConnectionStatus';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { Loader2, Menu, X, ChevronDown } from 'lucide-react';
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
  useKeyboardShortcuts();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [mcpTestbedServer, setMcpTestbedServer] = useState<string | null>(null);
  const { testAgent, setTestAgent } = useAppStore();
  const { activeWorkspaceName, workspaces } = useWorkspaceStore();

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    const stored = localStorage.getItem('sidebarWidth');
    return stored ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(stored, 10))) : SIDEBAR_DEFAULT;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Touch swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50;

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
    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      // Only handle horizontal swipes (dx dominates)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx > 0) {
          setSidebarOpen(true);
        } else {
          setSidebarOpen(false);
        }
      }
      touchStartX.current = null;
      touchStartY.current = null;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center main-content">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden main-content">
      {/* Top bar — search + history + user */}
      <div className="hidden md:block">
        <TopBar />
      </div>

    <div className="flex flex-1 min-h-0 overflow-hidden">
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
          'relative flex flex-col shrink-0 channel-sidebar border-r overflow-hidden',
          // Mobile: fixed overlay; Desktop: normal flow
          'max-md:fixed max-md:inset-y-0 max-md:left-16 max-md:z-30',
          'max-md:transition-transform max-md:duration-200 max-md:ease-in-out',
          sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        ].join(' ')}
      >
        {/* Workspace name */}
        <div className="flex items-center justify-between px-4 h-12 border-b shrink-0 channel-header">
          <button onClick={() => setWorkspaceModalOpen(true)} className="flex items-center gap-1 font-bold text-base truncate hover:bg-white/10 rounded px-1 -mx-1 transition-colors" style={{ color: 'var(--slack-text-primary)' }}>
            {workspaces.find((w) => w.name === activeWorkspaceName)?.name ?? 'Slack-A2A'}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
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
          <ChannelList workspaceId={activeWorkspaceName ?? undefined} />
          <Separator className="my-2 bg-white/5" />
          <DMList />
          <Separator className="my-2 bg-white/5" />
          <AgentList />
          <Separator className="my-2 bg-white/5" />
          <McpList onServerClick={(id) => setMcpTestbedServer(id)} />
        </div>

        {/* E4: Drag handle */}
        <div
          onMouseDown={onDragHandleMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-white/20 transition-colors z-10 hidden md:block"
          title="Drag to resize"
        />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 main-content overflow-hidden pb-14 md:pb-0">
        {/* Connection status banner */}
        <ConnectionStatus />

        {/* Mobile hamburger bar */}
        <div className="flex items-center h-10 px-3 border-b md:hidden shrink-0 main-content">
          <button
            className="text-slate-400 hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-2 text-white font-semibold text-sm">
            {workspaces.find((w) => w.name === activeWorkspaceName)?.name ?? 'Slack-A2A'}
          </span>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            {children}
          </div>
          {mcpTestbedServer && (
            <McpTestbed
              initialServerId={mcpTestbedServer}
              onClose={() => setMcpTestbedServer(null)}
            />
          )}
          {testAgent && (
            <AgentTestPane
              agentId={testAgent.id}
              agentName={testAgent.name}
              onClose={() => setTestAgent(null)}
            />
          )}
        </div>
      </div>
    </div>

      {/* Global modals */}
      <SearchModal />
      <CreateChannelModal />
      <BrowseChannelsModal />
      <AgentInviteModal />
      <AgentBuildModal />
      <WorkspaceModal open={workspaceModalOpen} onOpenChange={setWorkspaceModalOpen} />
      <KeyboardShortcutsModal />

      {/* Mobile bottom navigation */}
      <MobileNav onOpenSidebar={() => setSidebarOpen(true)} />
    </div>
  );
}
