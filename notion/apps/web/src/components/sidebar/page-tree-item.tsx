'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, File, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useWorkspaceStore, type PageNode } from '@/stores/workspace';

interface PageTreeItemProps {
  page: PageNode;
  depth: number;
  workspaceId: string;
  activePageId?: string;
  /** Optional callback invoked instead of router.push — used by the mobile drawer to also close itself */
  onNavigate?: (path: string) => void;
}

export function PageTreeItem({ page, depth, workspaceId, activePageId, onNavigate }: PageTreeItemProps) {
  const router = useRouter();
  const { togglePageExpanded, setPageChildren } = useWorkspaceStore();

  function navigate(path: string) {
    if (onNavigate) {
      onNavigate(path);
    } else {
      router.push(path);
    }
  }

  const isActive = page.id === activePageId;

  async function handleExpand(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (page.hasChildren && !page.children) {
      // Lazy load children (Decision #31)
      const children = await apiFetch<PageNode[]>(
        `/api/v1/pages/${page.id}/children?workspace_id=${workspaceId}`,
      );
      setPageChildren(page.id, children);
    } else {
      togglePageExpanded(page.id);
    }
  }

  async function handleCreate(e: React.MouseEvent) {
    e.stopPropagation();
    const newPage = await apiFetch<{ id: string }>(
      `/api/v1/pages?workspace_id=${workspaceId}`,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled', parentId: page.id }),
      },
    );
    navigate(`/workspace/${workspaceId}/${newPage.id}`);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group flex items-center h-[28px] px-2 rounded-[var(--radius-sm)] cursor-pointer text-sm',
          'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
          'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]',
          isActive && 'bg-[var(--bg-active)]',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => navigate(`/workspace/${workspaceId}/${page.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/workspace/${workspaceId}/${page.id}`);
          } else if (e.key === 'ArrowRight' && page.hasChildren) {
            e.preventDefault();
            handleExpand(e).catch(console.error);
          } else if (e.key === 'ArrowLeft' && page.expanded) {
            e.preventDefault();
            togglePageExpanded(page.id);
          }
        }}
      >
        {/* Expand toggle */}
        <button
          onClick={handleExpand}
          aria-label={page.expanded ? `Collapse ${page.title || 'page'}` : `Expand ${page.title || 'page'}`}
          aria-expanded={page.hasChildren ? page.expanded : undefined}
          className={cn(
            'flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] shrink-0',
            'hover:bg-[var(--bg-active)] transition-colors duration-[var(--duration-micro)]',
            'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]',
            !page.hasChildren && 'invisible',
          )}
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn(
              'text-[var(--text-tertiary)] transition-transform duration-[var(--duration-short)]',
              page.expanded && 'rotate-90',
            )}
          />
        </button>

        {/* Icon */}
        <span className="mx-1 text-sm shrink-0" aria-hidden="true">
          {page.icon ?? <File size={14} className="text-[var(--text-tertiary)]" />}
        </span>

        {/* Title */}
        <span className="truncate text-[var(--text-primary)] text-sm flex-1">
          {page.title || 'Untitled'}
        </span>

        {/* Add child page button */}
        <button
          onClick={handleCreate}
          aria-label={`Add page under ${page.title || 'Untitled'}`}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-active)] shrink-0 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)] focus-visible:opacity-100"
        >
          <Plus size={14} className="text-[var(--text-tertiary)]" aria-hidden="true" />
        </button>
      </div>

      {/* Children */}
      {page.expanded && page.children && (
        <div>
          {page.children.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              depth={depth + 1}
              workspaceId={workspaceId}
              activePageId={activePageId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
