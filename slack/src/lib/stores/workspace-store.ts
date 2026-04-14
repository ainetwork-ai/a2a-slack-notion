import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Workspace {
  id: string;
  name: string;
  icon: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspace: string;
  addWorkspace: (ws: Workspace) => void;
  setActive: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaces: [{ id: 'default', name: 'Slack-A2A', icon: 'A2A' }],
      activeWorkspace: 'default',
      addWorkspace: (ws) => set((s) => ({ workspaces: [...s.workspaces, ws] })),
      setActive: (id) => set({ activeWorkspace: id }),
    }),
    { name: 'slack-a2a-workspaces' }
  )
);
