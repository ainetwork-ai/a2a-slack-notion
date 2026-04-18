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
  /**
   * Canonical active workspace selector — workspace UUID. This is the value
   * that should be used when constructing routes (e.g. /notion/workspace/<id>)
   * or any cross-surface link, because Notion already keys on workspace ID.
   */
  activeWorkspaceId: string | null;
  /**
   * Backward-compatible mirror of the active workspace's name. Many slack
   * components/endpoints currently key on workspace name (channels, settings,
   * webhooks, etc.). Whenever activeWorkspaceId changes we keep this in sync.
   */
  activeWorkspaceName: string | null;
  isLoading: boolean;
  fetchWorkspaces: () => Promise<void>;
  /** Set active workspace by name OR UUID. Updates both id + name fields. */
  setActive: (nameOrId: string) => void;
  /** Set active workspace by UUID. Use this when navigating from a Notion URL. */
  setActiveById: (id: string) => void;
  addWorkspace: (ws: Workspace) => void;
}

/**
 * Match a workspace by name or UUID. Persisted state may contain either.
 */
function findActive(ws: Workspace[], ref: string | null): Workspace | null {
  if (!ref) return null;
  return ws.find((w) => w.name === ref || w.id === ref) ?? null;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspaceName: null,
      isLoading: false,

      fetchWorkspaces: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/workspaces');
          if (res.ok) {
            const data: Workspace[] = await res.json();
            set((s) => {
              // Prefer matching by id first (canonical), then fall back to name
              // for legacy persisted state that only stored the name.
              const active =
                findActive(data, s.activeWorkspaceId) ??
                findActive(data, s.activeWorkspaceName) ??
                data[0] ??
                null;
              return {
                workspaces: data,
                activeWorkspaceId: active?.id ?? null,
                activeWorkspaceName: active?.name ?? null,
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
        if (match) {
          set({ activeWorkspaceId: match.id, activeWorkspaceName: match.name });
        } else {
          // We don't recognise this ref yet (e.g. workspaces haven't loaded).
          // Best-effort: stash the ref in both slots; fetchWorkspaces() will
          // reconcile once the workspace list arrives.
          set({ activeWorkspaceId: ref, activeWorkspaceName: ref });
        }
      },

      setActiveById: (id) => {
        const match = findActive(get().workspaces, id);
        if (match) {
          set({ activeWorkspaceId: match.id, activeWorkspaceName: match.name });
        } else {
          set({ activeWorkspaceId: id });
        }
      },

      addWorkspace: (ws) =>
        set((s) => ({ workspaces: [...s.workspaces, ws] })),
    }),
    {
      name: 'slack-a2a-workspaces',
      partialize: (s) => ({
        activeWorkspaceId: s.activeWorkspaceId,
        activeWorkspaceName: s.activeWorkspaceName,
      }),
      // Older persisted shapes stored `activeWorkspaceSlug` (slug) or only
      // `activeWorkspaceName`. Promote whichever is present into both slots;
      // the next fetch reconciles them against the workspace list.
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') {
          return { activeWorkspaceId: null, activeWorkspaceName: null };
        }
        const any = persisted as Record<string, unknown>;
        const priorId =
          (any.activeWorkspaceId as string | undefined) ?? null;
        const priorName =
          (any.activeWorkspaceName as string | undefined) ??
          (any.activeWorkspaceSlug as string | undefined) ??
          null;
        // v2 only stored a name (which could have been a UUID). Promote it.
        if (version === 2 && !priorId && priorName) {
          return { activeWorkspaceId: priorName, activeWorkspaceName: priorName };
        }
        return { activeWorkspaceId: priorId, activeWorkspaceName: priorName };
      },
      version: 3,
    }
  )
);
