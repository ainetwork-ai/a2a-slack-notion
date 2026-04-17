// NOTE: This is the notion-specific workspace store.
// slack already has `workspace-store.ts` (workspaces list + active workspace name).
// notion's workspace store tracks page tree, favorites, recent pages, and
// sidebar UI state — concerns not present in slack's store.
// They are kept separate for now; if a merge is desired later, see the report.
import { create } from 'zustand';

export interface PageNode {
  id: string;
  title: string;
  icon: string | null;
  hasChildren: boolean;
  children?: PageNode[];
  expanded?: boolean;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  icon: string | null;
  role: string;
}

interface WorkspaceState {
  currentWorkspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  pages: PageNode[];
  favorites: PageNode[];
  recentPages: { pageId: string; title: string; icon: string | null; visitedAt: string }[];
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;

  setCurrentWorkspace: (ws: WorkspaceInfo) => void;
  setWorkspaces: (list: WorkspaceInfo[]) => void;
  setPages: (pages: PageNode[]) => void;
  setFavorites: (favs: PageNode[]) => void;
  setRecentPages: (recent: WorkspaceState['recentPages']) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  togglePageExpanded: (pageId: string) => void;
  setPageChildren: (pageId: string, children: PageNode[]) => void;
  setSearchOpen: (open: boolean) => void;
  updatePageTitle: (pageId: string, title: string) => void;
}

export const useNotionWorkspaceStore = create<WorkspaceState>((set) => ({
  currentWorkspace: null,
  workspaces: [],
  pages: [],
  favorites: [],
  recentPages: [],
  sidebarOpen: true,
  sidebarWidth: 240,
  searchOpen: false,

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
  setWorkspaces: (list) => set({ workspaces: list }),
  setPages: (pages) => set({ pages }),
  setFavorites: (favs) => set({ favorites: favs }),
  setRecentPages: (recent) => set({ recentPages: recent }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(0, Math.min(480, width)) }),
  setSearchOpen: (open) => set({ searchOpen: open }),

  togglePageExpanded: (pageId) =>
    set((s) => ({
      pages: toggleExpanded(s.pages, pageId),
    })),

  setPageChildren: (pageId, children) =>
    set((s) => ({
      pages: insertChildren(s.pages, pageId, children),
    })),

  updatePageTitle: (pageId, title) =>
    set((s) => ({
      pages: updateTitle(s.pages, pageId, title),
      favorites: s.favorites.map((f) => (f.id === pageId ? { ...f, title } : f)),
    })),
}));

// Backwards-compatible alias (notion's code imports `useWorkspaceStore` —
// we rename to `useNotionWorkspaceStore` in this repo to avoid clashing with
// slack's existing workspace store).
export { useNotionWorkspaceStore as useWorkspaceStore };

function toggleExpanded(nodes: PageNode[], id: string): PageNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, expanded: !n.expanded };
    if (n.children) return { ...n, children: toggleExpanded(n.children, id) };
    return n;
  });
}

function insertChildren(nodes: PageNode[], id: string, children: PageNode[]): PageNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, children, expanded: true };
    if (n.children) return { ...n, children: insertChildren(n.children, id, children) };
    return n;
  });
}

function updateTitle(nodes: PageNode[], id: string, title: string): PageNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, title };
    if (n.children) return { ...n, children: updateTitle(n.children, id, title) };
    return n;
  });
}
