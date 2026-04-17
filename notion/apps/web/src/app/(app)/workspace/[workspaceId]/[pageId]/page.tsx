'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Star, FileQuestion, Clock, MoreHorizontal, BookTemplate, Download, Share2 } from 'lucide-react';
import Link from 'next/link';
import type { JSONContent } from '@tiptap/react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { SharePanel } from '@/components/share-panel';
import { Breadcrumb } from '@/components/breadcrumb';
import { CollaborativeEditor } from '@/components/editor/collaborative-editor';
import { DatabaseView } from '@/components/database/database-view';
import { HistoryPanel } from '@/components/history-panel';
import { SaveAsTemplateDialog } from '@/components/save-as-template-dialog';
import { apiFetch } from '@/lib/api';
import { useWorkspaceStore, type WorkspaceInfo, type PageNode } from '@/stores/workspace';

interface ChildBlock {
  id: string;
  type: string;
}

interface PageData {
  id: string;
  title?: string;
  icon?: string | null;
  coverUrl?: string | null;
  content?: JSONContent;
  children?: ChildBlock[];
}

export default function PageView() {
  const { workspaceId, pageId } = useParams<{ workspaceId: string; pageId: string }>();
  const { address } = useAccount();
  const { setCurrentWorkspace, setWorkspaces, updatePageTitle, setFavorites } = useWorkspaceStore();
  const [page, setPage] = useState<PageData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [breadcrumbKey, setBreadcrumbKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const handleContentUpdate = useCallback(
    async (content: JSONContent) => {
      await apiFetch(`/api/v1/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }).catch(console.error);
    },
    [pageId],
  );

  useEffect(() => {
    async function load() {
      const workspaces = await apiFetch<WorkspaceInfo[]>('/api/v1/workspaces');
      setWorkspaces(workspaces);
      const current = workspaces.find((w) => w.id === workspaceId);
      if (current) setCurrentWorkspace(current);

      const pageData = await apiFetch<PageData>(`/api/v1/pages/${pageId}`);
      setPage(pageData);
    }
    load().catch((err) => {
      if (err instanceof Error && err.message === 'Page not found') {
        setNotFound(true);
      } else {
        console.error(err);
      }
    });
  }, [workspaceId, pageId, setCurrentWorkspace, setWorkspaces]);

  async function exportPage(format: 'markdown' | 'csv') {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`;
    const res = await fetch(`${apiUrl}/api/v1/pages/${pageId}/export?format=${format}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const ext = format === 'csv' ? 'csv' : 'md';
    const filename = `${page?.title ?? 'untitled'}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleFavorite() {
    if (isFavorite) {
      await apiFetch(`/api/v1/favorites/${pageId}`, { method: 'DELETE' });
      setIsFavorite(false);
    } else {
      await apiFetch('/api/v1/favorites', {
        method: 'POST',
        body: JSON.stringify({ pageId, workspaceId }),
      });
      setIsFavorite(true);
    }
    // Sync sidebar favorites section
    const favsData = await apiFetch<PageNode[]>(`/api/v1/favorites?workspace_id=${workspaceId}`);
    setFavorites(favsData);
  }

  if (notFound) {
    return (
      <div className="flex h-screen">
        <Sidebar workspaceId={workspaceId} activePageId={pageId} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileQuestion size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
            <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Page not found</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-4">This page doesn&apos;t exist or you don&apos;t have access.</p>
            <Link
              href={`/workspace/${workspaceId}`}
              className="text-sm text-[var(--accent-blue)] hover:underline"
            >
              Back to workspace
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar workspaceId={workspaceId} activePageId={pageId} />

      <div className="flex flex-1 min-w-0 overflow-hidden">
      <main role="main" aria-label="Page content" className="flex-1 overflow-y-auto min-w-0">
        {/* Topbar */}
        <header className="h-[44px] flex items-center justify-between px-4 border-b border-[var(--divider)]">
          <Breadcrumb workspaceId={workspaceId} pageId={pageId} refreshKey={breadcrumbKey} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen((prev) => !prev)}
              title="Page history"
              aria-label="Page history"
              aria-pressed={historyOpen}
              className={`notion-hover inline-flex items-center justify-center h-7 w-7 text-[var(--text-secondary)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] ${historyOpen ? 'bg-[var(--bg-active)]' : ''}`}
            >
              <Clock
                size={16}
                aria-hidden="true"
                className={historyOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
              />
            </button>
            <button
              onClick={toggleFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className="notion-hover inline-flex items-center justify-center h-7 w-7 text-[var(--text-secondary)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]"
            >
              <Star
                size={16}
                aria-hidden="true"
                className={isFavorite ? 'fill-[var(--color-yellow)] text-[var(--color-yellow)]' : 'text-[var(--text-secondary)]'}
              />
            </button>

            <button
              onClick={() => setShareOpen((prev) => !prev)}
              title="Share"
              aria-label="Share"
              aria-expanded={shareOpen}
              className={`notion-hover inline-flex items-center gap-1.5 h-7 px-2.5 text-sm font-medium transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] ${shareOpen ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
            >
              <Share2 size={14} aria-hidden="true" />
              Share
            </button>

            {/* More actions menu */}
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                title="More actions"
                aria-label="More actions"
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                className={`notion-hover inline-flex items-center justify-center h-7 w-7 text-[var(--text-secondary)] transition-colors duration-[var(--duration-micro)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] ${moreMenuOpen ? 'bg-[var(--bg-active)]' : ''}`}
              >
                <MoreHorizontal
                  size={16}
                  aria-hidden="true"
                  className={moreMenuOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
                />
              </button>

              {moreMenuOpen && (
                <>
                  {/* Click-away backdrop */}
                  <div
                    className="fixed inset-0 z-[var(--z-dropdown)]"
                    onClick={() => setMoreMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-[var(--z-dropdown)] w-[200px] bg-[var(--bg-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-panel)] border border-[var(--divider)] py-1">
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setSaveTemplateOpen(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                    >
                      <BookTemplate size={14} className="text-[var(--text-tertiary)]" />
                      Save as template
                    </button>
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        exportPage('markdown').catch(console.error);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                    >
                      <Download size={14} className="text-[var(--text-tertiary)]" />
                      Export as Markdown
                    </button>
                    {page?.children?.some((b) => b.type === 'database') && (
                      <button
                        onClick={() => {
                          setMoreMenuOpen(false);
                          const dbBlock = page.children?.find((b) => b.type === 'database');
                          if (dbBlock) exportPage('csv').catch(console.error);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
                      >
                        <Download size={14} className="text-[var(--text-tertiary)]" />
                        Export database as CSV
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content area */}
        {!page ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '2px solid var(--bg-hover)',
                borderTopColor: 'var(--text-tertiary)',
                animation: 'spin 0.7s linear infinite',
              }}
              aria-label="Loading page"
              role="status"
            />
          </div>
        ) : (
        <div className="mx-auto max-w-full md:max-w-[900px] px-4 md:px-24 py-12">
          {/* Cover image */}
          {page?.coverUrl && (
            <div className="relative -mx-24 -mt-12 mb-8 h-[280px] overflow-hidden">
              <img
                src={page.coverUrl}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Page icon */}
          {page?.icon && (
            <div className="text-[64px] leading-none mb-2">{page.icon}</div>
          )}

          {/* Title */}
          <h1
            className="text-[40px] font-bold leading-[1.2] text-[var(--text-primary)] outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--text-placeholder)] placeholder:text-[var(--text-placeholder)]"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Untitled"
            onFocus={(e) => {
              const text = e.currentTarget.textContent?.trim() ?? '';
              if (text === 'Untitled' || text === '') {
                const range = document.createRange();
                range.selectNodeContents(e.currentTarget);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }
            }}
            onBlur={async (e) => {
              const title = e.currentTarget.textContent ?? '';
              await apiFetch(`/api/v1/pages/${pageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ title }),
              });
              updatePageTitle(pageId, title);
              setBreadcrumbKey((k) => k + 1);
            }}
          >
            {page?.title || ''}
          </h1>

          {/* Collaborative editor — real-time via Hocuspocus, includes block handle/context menu/DnD */}
          <div className="mt-4">
            {pageId && (
              <CollaborativeEditor
                key={pageId}
                pageId={pageId}
                userName={address ?? 'Anonymous'}
                workspaceId={workspaceId}
              />
            )}
          </div>

          {/* Inline database blocks */}
          {page?.children
            ?.filter((block) => block.type === 'database')
            .map((block) => (
              <div key={block.id} className="mt-4">
                <DatabaseView databaseId={block.id} inline workspaceId={workspaceId} />
              </div>
            ))}
        </div>
        )}
      </main>

      {/* History panel — slide in from the right */}
      {historyOpen && (
        <HistoryPanel
          pageId={pageId}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => {
            // Reload page data after restore
            apiFetch<PageData>(`/api/v1/pages/${pageId}`)
              .then((data) => setPage(data))
              .catch(console.error);
          }}
        />
      )}
      </div>

      {/* Save as template dialog */}
      {saveTemplateOpen && (
        <SaveAsTemplateDialog
          workspaceId={workspaceId}
          pageTitle={page?.title ?? 'Untitled'}
          pageContent={page?.content ?? []}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}

      {/* Share panel */}
      <SharePanel open={shareOpen} onClose={() => setShareOpen(false)} pageId={pageId} />
    </div>
  );
}
