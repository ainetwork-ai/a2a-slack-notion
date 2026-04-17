'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Star, Clock, Plus, ChevronsLeft, Trash2, RotateCcw, X, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/notion/api-client';
import { useWorkspaceStore, type PageNode } from '@/lib/stores/notion-workspace-store';
import { PageTreeItem } from './PageTreeItem';
import TemplateGallery from '@/components/notion/TemplateGallery';

interface TrashedPage {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  archivedAt: string;
}

interface SidebarProps {
  workspaceId: string;
  activePageId?: string;
}

/**
 * NotionSidebar — renamed from notion's `Sidebar` to avoid clashing with
 * slack's existing `Sidebar` component. Import as
 *   import { NotionSidebar } from '@/components/notion/sidebar/Sidebar';
 */
export function NotionSidebar({ workspaceId, activePageId }: SidebarProps) {
  const router = useRouter();
  const {
    currentWorkspace,
    pages,
    favorites,
    recentPages,
    sidebarOpen,
    sidebarWidth,
    setPages,
    setFavorites,
    setRecentPages,
    toggleSidebar,
    setSearchOpen,
  } = useWorkspaceStore();

  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedPages, setTrashedPages] = useState<TrashedPage[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Mobile overlay open state (separate from desktop sidebarOpen)
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const [pagesData, favsData, recentData] = await Promise.all([
        apiFetch<PageNode[]>(`/api/v1/pages?workspace_id=${workspaceId}`),
        apiFetch<PageNode[]>(`/api/v1/favorites?workspace_id=${workspaceId}`),
        apiFetch<{ pageId: string; title: string; icon: string | null; visitedAt: string }[]>(
          `/api/v1/recent?workspace_id=${workspaceId}`,
        ),
      ]);
      setPages(pagesData);
      setFavorites(favsData);
      setRecentPages(recentData);
    }
    load().catch(console.error);
  }, [workspaceId, setPages, setFavorites, setRecentPages]);

  function handleNewPage() {
    setGalleryOpen(true);
  }

  async function loadTrash() {
    setTrashLoading(true);
    setTrashError(null);
    try {
      const data = await apiFetch<TrashedPage[]>(
        `/api/v1/trash?workspace_id=${workspaceId}`,
      );
      setTrashedPages(data);
    } catch (err) {
      setTrashError(err instanceof Error ? err.message : 'Failed to load trash');
    } finally {
      setTrashLoading(false);
    }
  }

  function handleOpenTrash() {
    setTrashOpen(true);
    loadTrash().catch(console.error);
  }

  async function handleRestorePage(pageId: string) {
    try {
      await apiFetch(`/api/v1/trash/${pageId}/restore`, { method: 'POST' });
      setTrashedPages((prev) => prev.filter((p) => p.id !== pageId));
      // Reload sidebar pages
      const pagesData = await apiFetch<PageNode[]>(
        `/api/v1/pages?workspace_id=${workspaceId}`,
      );
      setPages(pagesData);
    } catch (err) {
      console.error('Restore failed:', err);
    }
  }

  async function handleDeletePermanently(pageId: string) {
    if (!confirm('Permanently delete this page? This cannot be undone.')) return;
    try {
      await apiFetch(`/api/v1/trash/${pageId}`, { method: 'DELETE' });
      setTrashedPages((prev) => prev.filter((p) => p.id !== pageId));
    } catch (err) {
      console.error('Permanent delete failed:', err);
    }
  }

  // Close mobile drawer on backdrop click or page selection
  function handleMobileClose() {
    setMobileOpen(false);
  }

  // Navigate and close mobile sidebar
  function handlePageNavigate(path: string) {
    router.push(path);
    setMobileOpen(false);
  }

  // Desktop collapsed state — show expand button
  if (!sidebarOpen) {
    return (
      <>
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
            className="md:hidden fixed top-2 left-2 z-[var(--z-sticky)] p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            <Menu size={16} className="text-[var(--text-tertiary)]" />
          </button>
        )}
        <button
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          className="hidden md:block fixed top-2 left-2 z-[var(--z-sticky)] p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
        >
          <ChevronsLeft size={16} className="rotate-180 text-[var(--text-tertiary)]" />
        </button>
      </>
    );
  }

  return (
    <>
      {/* Hamburger button — mobile only, when desktop sidebar is open but mobile overlay is closed */}
      {!mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open sidebar"
          className="md:hidden fixed top-2 left-2 z-[var(--z-sticky)] p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
        >
          <Menu size={16} className="text-[var(--text-tertiary)]" />
        </button>
      )}

      {/* Desktop sidebar — always visible on md+ */}
      <aside
        role="navigation"
        aria-label="Workspace sidebar"
        className="hidden md:flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--divider)] shrink-0 h-screen overflow-hidden"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Workspace header */}
        <div className="flex items-center justify-between h-[44px] px-3">
          <button
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[var(--radius-sm)] px-1.5 py-1 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
            aria-label={`Workspace: ${currentWorkspace?.name ?? 'Workspace'}`}
          >
            {currentWorkspace?.icon && <span aria-hidden="true">{currentWorkspace.icon}</span>}
            <span className="truncate">{currentWorkspace?.name ?? 'Workspace'}</span>
          </button>
          <button
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            <ChevronsLeft size={16} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-2 py-1">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search pages (Cmd+K)"
            className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            <Search size={14} aria-hidden="true" />
            <span>Search</span>
            <span className="ml-auto text-[10px] text-[var(--text-tertiary)] font-mono opacity-60" aria-hidden="true">⌘K</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {/* Favorites */}
          {favorites.length > 0 && (
            <SidebarSection label="Favorites" icon={<Star size={12} aria-hidden="true" />}>
              {favorites.map((fav) => (
                <PageTreeItem
                  key={fav.id}
                  page={fav}
                  depth={0}
                  workspaceId={workspaceId}
                  activePageId={activePageId}
                />
              ))}
            </SidebarSection>
          )}

          {/* Recent */}
          {recentPages.length > 0 && (
            <SidebarSection label="Recent" icon={<Clock size={12} aria-hidden="true" />}>
              {recentPages.slice(0, 5).map((r) => (
                <div
                  key={r.pageId}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/workspace/${workspaceId}/${r.pageId}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/workspace/${workspaceId}/${r.pageId}`);
                    }
                  }}
                  aria-current={r.pageId === activePageId ? 'page' : undefined}
                  className={cn(
                    'flex items-center h-[28px] px-3 rounded-[var(--radius-sm)] cursor-pointer text-sm',
                    'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]',
                    r.pageId === activePageId && 'bg-[var(--bg-active)]',
                  )}
                >
                  <span className="mr-1.5 text-sm" aria-hidden="true">{r.icon ?? '📄'}</span>
                  <span className="truncate text-[var(--text-primary)]">{r.title || 'Untitled'}</span>
                </div>
              ))}
            </SidebarSection>
          )}

          {/* Private pages */}
          <SidebarSection
            label="Private"
            action={
              <button
                onClick={handleNewPage}
                aria-label="New page"
                className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-active)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
              >
                <Plus size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
              </button>
            }
          >
            {pages.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-tertiary)]">No pages yet</p>
            ) : (
              pages.map((page) => (
                <PageTreeItem
                  key={page.id}
                  page={page}
                  depth={0}
                  workspaceId={workspaceId}
                  activePageId={activePageId}
                />
              ))
            )}
          </SidebarSection>
        </div>

        {/* Trash section */}
        <div className="px-2 py-1 border-t border-[var(--divider)]">
          <button
            onClick={handleOpenTrash}
            aria-label="Open trash"
            className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Trash</span>
          </button>
        </div>

        {/* New page button */}
        <div className="px-2 py-2 border-t border-[var(--divider)]">
          <button
            onClick={handleNewPage}
            className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            <Plus size={14} aria-hidden="true" />
            <span>New page</span>
          </button>
        </div>

        {/* Trash panel overlay */}
        {trashOpen && (
          <div
            className="fixed inset-0 z-[var(--z-modal)] flex"
            onClick={() => setTrashOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20" />

            {/* Panel */}
            <div
              className="absolute left-0 top-0 h-full flex flex-col bg-[var(--bg-default)] shadow-[var(--shadow-panel)]"
              style={{ width: '320px', marginLeft: `${sidebarWidth}px` }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 h-[44px] border-b border-[var(--divider)] shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Trash2 size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
                  Trash
                </div>
                <button
                  onClick={() => setTrashOpen(false)}
                  aria-label="Close trash panel"
                  className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
                >
                  <X size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
                </button>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-y-auto py-1" role="status" aria-live="polite">
                {trashLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-xs text-[var(--text-tertiary)]">Loading…</span>
                  </div>
                ) : trashError ? (
                  <div className="px-4 py-3 text-xs text-red-600">{trashError}</div>
                ) : trashedPages.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Trash2 size={24} className="mx-auto mb-2 text-[var(--text-tertiary)] opacity-40" aria-hidden="true" />
                    <p className="text-xs text-[var(--text-tertiary)]">Trash is empty</p>
                  </div>
                ) : (
                  trashedPages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] group"
                    >
                      <span className="text-base shrink-0" aria-hidden="true">{page.icon ?? '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">
                          {page.title || 'Untitled'}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">
                          {new Date(page.archivedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-micro)] shrink-0">
                        <button
                          onClick={() => handleRestorePage(page.id).catch(console.error)}
                          title="Restore"
                          aria-label={`Restore ${page.title || 'Untitled'}`}
                          className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-active)] text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
                        >
                          <RotateCcw size={13} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(page.id).catch(console.error)}
                          title="Delete permanently"
                          aria-label={`Permanently delete ${page.title || 'Untitled'}`}
                          className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-active)] text-[var(--text-tertiary)] hover:text-red-500 transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Template gallery modal */}
        {galleryOpen && (
          <TemplateGallery
            workspaceId={workspaceId}
            onClose={() => setGalleryOpen(false)}
          />
        )}
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[var(--z-modal,10000)] flex">
          {/* Backdrop — click to close */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleMobileClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside
            role="navigation"
            aria-label="Workspace sidebar"
            className="relative flex flex-col w-[280px] bg-[var(--bg-sidebar)] h-full overflow-hidden shadow-[var(--shadow-modal)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Workspace header */}
            <div className="flex items-center justify-between h-[44px] px-3">
              <button
                className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-[var(--radius-sm)] px-1.5 py-1 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
                aria-label={`Workspace: ${currentWorkspace?.name ?? 'Workspace'}`}
              >
                {currentWorkspace?.icon && <span aria-hidden="true">{currentWorkspace.icon}</span>}
                <span className="truncate">{currentWorkspace?.name ?? 'Workspace'}</span>
              </button>
              <button
                onClick={handleMobileClose}
                aria-label="Close sidebar"
                className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
              >
                <X size={16} className="text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Search */}
            <div className="px-2 py-1">
              <button
                onClick={() => {
                  setSearchOpen(true);
                  handleMobileClose();
                }}
                aria-label="Search pages (Cmd+K)"
                className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
              >
                <Search size={14} aria-hidden="true" />
                <span>Search</span>
                <span className="ml-auto text-[10px] text-[var(--text-tertiary)] font-mono opacity-60" aria-hidden="true">⌘K</span>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-1 py-1">
              {/* Favorites */}
              {favorites.length > 0 && (
                <SidebarSection label="Favorites" icon={<Star size={12} aria-hidden="true" />}>
                  {favorites.map((fav) => (
                    <PageTreeItem
                      key={fav.id}
                      page={fav}
                      depth={0}
                      workspaceId={workspaceId}
                      activePageId={activePageId}
                      onNavigate={handlePageNavigate}
                    />
                  ))}
                </SidebarSection>
              )}

              {/* Recent */}
              {recentPages.length > 0 && (
                <SidebarSection label="Recent" icon={<Clock size={12} aria-hidden="true" />}>
                  {recentPages.slice(0, 5).map((r) => (
                    <div
                      key={r.pageId}
                      role="button"
                      tabIndex={0}
                      onClick={() => handlePageNavigate(`/workspace/${workspaceId}/${r.pageId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePageNavigate(`/workspace/${workspaceId}/${r.pageId}`);
                        }
                      }}
                      aria-current={r.pageId === activePageId ? 'page' : undefined}
                      className={cn(
                        'flex items-center h-[28px] px-3 rounded-[var(--radius-sm)] cursor-pointer text-sm',
                        'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]',
                        r.pageId === activePageId && 'bg-[var(--bg-active)]',
                      )}
                    >
                      <span className="mr-1.5 text-sm" aria-hidden="true">{r.icon ?? '📄'}</span>
                      <span className="truncate text-[var(--text-primary)]">{r.title || 'Untitled'}</span>
                    </div>
                  ))}
                </SidebarSection>
              )}

              {/* Private pages */}
              <SidebarSection
                label="Private"
                action={
                  <button
                    onClick={handleNewPage}
                    aria-label="New page"
                    className="p-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-active)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
                  >
                    <Plus size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
                  </button>
                }
              >
                {pages.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--text-tertiary)]">No pages yet</p>
                ) : (
                  pages.map((page) => (
                    <PageTreeItem
                      key={page.id}
                      page={page}
                      depth={0}
                      workspaceId={workspaceId}
                      activePageId={activePageId}
                      onNavigate={handlePageNavigate}
                    />
                  ))
                )}
              </SidebarSection>
            </div>

            {/* Trash section */}
            <div className="px-2 py-1 border-t border-[var(--divider)]">
              <button
                onClick={handleOpenTrash}
                aria-label="Open trash"
                className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Trash</span>
              </button>
            </div>

            {/* New page button */}
            <div className="px-2 py-2 border-t border-[var(--divider)]">
              <button
                onClick={handleNewPage}
                className="flex items-center gap-2 w-full h-[28px] px-2 text-sm text-[var(--text-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
              >
                <Plus size={14} aria-hidden="true" />
                <span>New page</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Template gallery modal */}
      {galleryOpen && (
        <TemplateGallery
          workspaceId={workspaceId}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}

// Backwards-compat alias: notion calls this `Sidebar` internally.
export { NotionSidebar as Sidebar };

function SidebarSection({
  label,
  icon,
  action,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
          {icon}
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
