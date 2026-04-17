'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Star, Clock, FileText, Plus } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Page {
  id: string;
  type: string;
  workspaceId: string;
  properties: {
    title?: string;
    icon?: string;
    [key: string]: unknown;
  } | null;
  createdAt: string;
}

interface Favorite {
  id: string;
  pageId: string;
  workspaceId: string;
  position: number;
}

interface RecentPage {
  id: string;
  pageId: string;
  workspaceId: string;
  visitedAt: string;
}

interface PagesResponse {
  pages: Page[];
  nextCursor?: string;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Sub-section collapse toggle ──────────────────────────────────────────────

function SubSection({
  label,
  icon,
  defaultOpen = true,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-2 py-0.5 text-[11px] font-semibold text-[#bcabbc] hover:text-white transition-colors uppercase tracking-wider"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        {icon}
        {label}
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

// ─── Single page row ──────────────────────────────────────────────────────────

function PageRow({
  id,
  title,
  icon,
  onClick,
  active,
}: {
  id: string;
  title: string;
  icon?: string | null;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-[15px] transition-colors text-left',
        active
          ? 'bg-[#4a154b]/60 text-white'
          : 'text-[#bcabbc] hover:bg-white/5 hover:text-white'
      )}
    >
      {icon ? (
        <span className="text-sm leading-none shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <FileText className="w-4 h-4 shrink-0 opacity-70" />
      )}
      <span className="truncate flex-1">{title || 'Untitled'}</span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface NotionNavProps {
  workspaceId: string;
}

export default function NotionNav({ workspaceId }: NotionNavProps) {
  const router = useRouter();

  // SWR keys — null disables fetching when no workspaceId
  const pagesKey = workspaceId
    ? `/api/pages?workspaceId=${workspaceId}&limit=50`
    : null;
  const favoritesKey = workspaceId
    ? `/api/favorites?workspaceId=${workspaceId}`
    : null;
  const recentsKey = workspaceId
    ? `/api/recent-pages?workspaceId=${workspaceId}&limit=10`
    : null;

  const { data: pagesData, mutate: mutatePages } = useSWR<PagesResponse>(
    pagesKey,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 0 }
  );
  const { data: favoritesData } = useSWR<Favorite[]>(
    favoritesKey,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 0 }
  );
  const { data: recentsData } = useSWR<RecentPage[]>(
    recentsKey,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 0 }
  );

  const pages: Page[] = pagesData?.pages ?? [];
  const favorites: Favorite[] = Array.isArray(favoritesData) ? favoritesData : [];
  const recents: RecentPage[] = Array.isArray(recentsData) ? recentsData : [];

  // Build a quick lookup: pageId → Page
  const pageMap = new Map<string, Page>(pages.map((p) => [p.id, p]));

  // Favorites with resolved page data — only include those that exist in pages list
  const favPages = favorites
    .sort((a, b) => a.position - b.position)
    .map((f) => pageMap.get(f.pageId))
    .filter((p): p is Page => p !== undefined);

  // Recents — deduplicate against favorites, show max 5
  const favPageIds = new Set(favPages.map((p) => p.id));
  const recentPages = recents
    .filter((r) => !favPageIds.has(r.pageId))
    .slice(0, 5)
    .map((r) => pageMap.get(r.pageId))
    .filter((p): p is Page => p !== undefined);

  function navigateTo(pageId: string) {
    router.push(`/pages/${pageId}`);
  }

  async function handleNewPage() {
    if (!workspaceId) return;
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, title: 'Untitled' }),
      });
      if (!res.ok) return;
      const page: Page = await res.json();
      mutatePages();
      router.push(`/pages/${page.id}`);
    } catch {
      // silently degrade — endpoint may not be ready
    }
  }

  if (!workspaceId) return null;

  const hasContent = favPages.length > 0 || recentPages.length > 0 || pages.length > 0;

  return (
    <div className="px-2 py-1">
      {/* Section header */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[#bcabbc] text-sm font-semibold">Docs</span>
        <button
          onClick={handleNewPage}
          className="text-[#bcabbc] hover:text-white p-0.5 rounded transition-colors"
          title="New page"
          aria-label="New page"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {!hasContent ? (
        <p className="px-2 py-1.5 text-xs text-[#bcabbc]/60">No pages yet</p>
      ) : (
        <>
          {/* Favorites */}
          {favPages.length > 0 && (
            <SubSection
              label="Favorites"
              icon={<Star className="w-3 h-3 shrink-0" />}
              defaultOpen
            >
              {favPages.map((p) => (
                <PageRow
                  key={p.id}
                  id={p.id}
                  title={p.properties?.title ?? 'Untitled'}
                  icon={p.properties?.icon}
                  onClick={() => navigateTo(p.id)}
                />
              ))}
            </SubSection>
          )}

          {/* Recent */}
          {recentPages.length > 0 && (
            <SubSection
              label="Recent"
              icon={<Clock className="w-3 h-3 shrink-0" />}
              defaultOpen
            >
              {recentPages.map((p) => (
                <PageRow
                  key={p.id}
                  id={p.id}
                  title={p.properties?.title ?? 'Untitled'}
                  icon={p.properties?.icon}
                  onClick={() => navigateTo(p.id)}
                />
              ))}
            </SubSection>
          )}

          {/* All pages */}
          {pages.length > 0 && (
            <SubSection
              label="All pages"
              icon={<FileText className="w-3 h-3 shrink-0" />}
              defaultOpen={favPages.length === 0 && recentPages.length === 0}
            >
              {pages.map((p) => (
                <PageRow
                  key={p.id}
                  id={p.id}
                  title={p.properties?.title ?? 'Untitled'}
                  icon={p.properties?.icon}
                  onClick={() => navigateTo(p.id)}
                />
              ))}
            </SubSection>
          )}
        </>
      )}
    </div>
  );
}
