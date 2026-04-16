import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Workspace {
  id: string;
  name: string;
  iconText: string;
  iconUrl?: string | null;
  description?: string;
  role?: string;
  createdAt?: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceName: string | null;
  isLoading: boolean;
  fetchWorkspaces: () => Promise<void>;
  setActive: (nameOrId: string) => void;
  addWorkspace: (ws: Workspace) => void;
}

/**
 * Match a workspace by name or UUID. Historically the store held UUIDs;
 * rehydrated sessions may still have a UUID in localStorage until they
 * touch `setActive` again.
 */
function findActive(ws: Workspace[], ref: string | null): Workspace | null {
  if (!ref) return null;
  return ws.find((w) => w.name === ref || w.id === ref) ?? null;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceName: null,
      isLoading: false,

      fetchWorkspaces: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/workspaces');
          if (res.ok) {
            const data: Workspace[] = await res.json();
            set((s) => {
              const active = findActive(data, s.activeWorkspaceName);
              return {
                workspaces: data,
                activeWorkspaceName: active?.name ?? data[0]?.name ?? null,
              };
            });
          }
        } catch {
          // ignore
        } finally {
          set({ isLoading: false });
        }
      },

      setActive: (ref) => {
        const match = findActive(get().workspaces, ref);
        set({ activeWorkspaceName: match?.name ?? ref });
      },

      addWorkspace: (ws) =>
        set((s) => ({ workspaces: [...s.workspaces, ws] })),
    }),
    {
      name: 'slack-a2a-workspaces',
      partialize: (s) => ({ activeWorkspaceName: s.activeWorkspaceName }),
      // Older persisted shapes stored `activeWorkspaceId` (UUID) or
      // `activeWorkspaceSlug` (slug). Both resolve to the workspace row,
      // so we promote them into the new `activeWorkspaceName` slot; the
      // next fetch replaces them with the canonical workspace.name.
      migrate: (persisted) => {
        if (persisted && typeof persisted === 'object') {
          const any = persisted as Record<string, unknown>;
          const prior =
            (any.activeWorkspaceName as string | undefined) ??
            (any.activeWorkspaceSlug as string | undefined) ??
            (any.activeWorkspaceId as string | undefined) ??
            null;
          return { activeWorkspaceName: prior };
        }
        return { activeWorkspaceName: null };
      },
      version: 2,
    }
  )
);
