import { create } from 'zustand';

interface AppStore {
  activeThread: string | null;
  searchOpen: boolean;
  agentInviteOpen: boolean;
  createChannelOpen: boolean;
  sidebarCollapsed: boolean;
  shortcutsModalOpen: boolean;
  notificationPanelOpen: boolean;

  setActiveThread: (messageId: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  setAgentInviteOpen: (open: boolean) => void;
  setCreateChannelOpen: (open: boolean) => void;
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
  createChannelOpen: false,
  sidebarCollapsed: false,
  shortcutsModalOpen: false,
  notificationPanelOpen: false,

  setActiveThread: (messageId) => set({ activeThread: messageId }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setAgentInviteOpen: (open) => set({ agentInviteOpen: open }),
  setCreateChannelOpen: (open) => set({ createChannelOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),
  toggleNotificationPanel: () => set((state) => ({ notificationPanelOpen: !state.notificationPanelOpen })),
}));
