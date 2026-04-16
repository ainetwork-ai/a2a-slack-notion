import { create } from 'zustand';

interface AppStore {
  activeThread: string | null;
  searchOpen: boolean;
  agentInviteOpen: boolean;
  agentBuildOpen: boolean;
  agentEditId: string | null;
  testAgent: { id: string; name: string } | null;
  createChannelOpen: boolean;
  browseChannelsOpen: boolean;
  sidebarCollapsed: boolean;
  shortcutsModalOpen: boolean;
  notificationPanelOpen: boolean;

  setActiveThread: (messageId: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  setAgentInviteOpen: (open: boolean) => void;
  setAgentBuildOpen: (open: boolean) => void;
  setAgentEditId: (agentId: string | null) => void;
  setTestAgent: (agent: { id: string; name: string } | null) => void;
  setCreateChannelOpen: (open: boolean) => void;
  setBrowseChannelsOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setShortcutsModalOpen: (open: boolean) => void;
  setNotificationPanelOpen: (open: boolean) => void;
  toggleNotificationPanel: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeThread: null,
  searchOpen: false,
  agentInviteOpen: false,
  agentBuildOpen: false,
  agentEditId: null,
  testAgent: null,
  createChannelOpen: false,
  browseChannelsOpen: false,
  sidebarCollapsed: false,
  shortcutsModalOpen: false,
  notificationPanelOpen: false,

  setActiveThread: (messageId) => set({ activeThread: messageId }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setAgentInviteOpen: (open) => set({ agentInviteOpen: open }),
  setAgentBuildOpen: (open) => set({ agentBuildOpen: open }),
  setAgentEditId: (agentId) => set({ agentEditId: agentId }),
  setTestAgent: (agent) => set({ testAgent: agent }),
  setCreateChannelOpen: (open) => set({ createChannelOpen: open }),
  setBrowseChannelsOpen: (open) => set({ browseChannelsOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),
  toggleNotificationPanel: () => set((state) => ({ notificationPanelOpen: !state.notificationPanelOpen })),
}));
