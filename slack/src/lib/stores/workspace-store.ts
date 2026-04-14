import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconText: string;
  description?: string;
  role?: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  fetchWorkspaces: () => Promise<void>;
  setActive: (id: string) => void;
  addWorkspace: (ws: Workspace) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      isLoading: false,

      fetchWorkspaces: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/workspaces');
          if (res.ok) {
            const data: Workspace[] = await res.json();
            set((s) => ({
              workspaces: data,
              // Keep active if still valid, otherwise pick first
              activeWorkspaceId:
                s.activeWorkspaceId && data.some((w) => w.id === s.activeWorkspaceId)
                  ? s.activeWorkspaceId
                  : data[0]?.id ?? null,
            }));
          }
        } catch {
          // ignore
        } finally {
          set({ isLoading: false });
        }
      },

      setActive: (id) => set({ activeWorkspaceId: id }),

      addWorkspace: (ws) =>
        set((s) => ({ workspaces: [...s.workspaces, ws] })),
    }),
    { name: 'slack-a2a-workspaces', partialize: (s) => ({ activeWorkspaceId: s.activeWorkspaceId }) }
  )
);
