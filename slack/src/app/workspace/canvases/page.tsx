'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { FileText, Search, Loader2, Clock, Hash, User } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type PipelineStatus = 'draft' | 'edited' | 'fact-checked' | 'published';
type SortKey = 'updatedAt' | 'createdAt' | 'title';

interface CanvasItem {
  id: string;
  title: string;
  topic: string | null;
  content: string;
  channelId: string | null;
  channelName: string | null;
  pipelineStatus: PipelineStatus | null;
  createdBy: string;
  ownerName: string | null;
  updatedAt: string;
  createdAt: string;
}

const PIPELINE_STATUSES: { key: PipelineStatus; label: string }[] = [
  { key: 'draft',        label: 'Draft' },
  { key: 'edited',       label: 'Edited' },
  { key: 'fact-checked', label: 'Fact-checked' },
  { key: 'published',    label: 'Published' },
];

const STATUS_COLORS: Record<PipelineStatus, string> = {
  draft:          'bg-blue-500/20 text-blue-300 border-blue-500/30',
  edited:         'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'fact-checked': 'bg-orange-400/20 text-orange-300 border-orange-400/30',
  published:      'bg-green-500/20 text-green-300 border-green-500/30',
};

const STATUS_CHIP_ACTIVE: Record<PipelineStatus, string> = {
  draft:          'bg-blue-500 text-white border-blue-500',
  edited:         'bg-yellow-500 text-white border-yellow-500',
  'fact-checked': 'bg-orange-400 text-white border-orange-400',
  published:      'bg-green-500 text-white border-green-500',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CanvasBrowserPage() {
  const router = useRouter();
  const { activeWorkspaceName } = useWorkspaceStore();

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [activeStatuses, setActiveStatuses] = useState<Set<PipelineStatus>>(new Set());
  const [channelFilter, setChannelFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  const apiUrl = activeWorkspaceName
    ? `/api/canvases?workspaceId=${encodeURIComponent(activeWorkspaceName)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`
    : null;

  const { data: canvasesRaw, isLoading } = useSWR<CanvasItem[]>(apiUrl, fetcher, {
    keepPreviousData: true,
  });

  const items = canvasesRaw ?? [];

  // Derive unique channel options from results
  const channelOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of items) {
      if (c.channelId && c.channelName) map.set(c.channelId, c.channelName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  // Derive unique owner options from results
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of items) {
      if (c.createdBy && c.ownerName) map.set(c.createdBy, c.ownerName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  function toggleStatus(key: PipelineStatus) {
    setActiveStatuses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Client-side filtering + sorting
  const filtered = useMemo(() => {
    let list = [...items];

    if (activeStatuses.size > 0) {
      list = list.filter(c => c.pipelineStatus && activeStatuses.has(c.pipelineStatus));
    }
    if (channelFilter) {
      list = list.filter(c => c.channelId === channelFilter);
    }
    if (ownerFilter) {
      list = list.filter(c => c.createdBy === ownerFilter);
    }

    list.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      const aVal = sort === 'createdAt' ? a.createdAt : a.updatedAt;
      const bVal = sort === 'createdAt' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    });

    return list;
  }, [items, activeStatuses, channelFilter, ownerFilter, sort]);

  function openCanvas(canvas: CanvasItem) {
    if (canvas.channelName) {
      router.push(`/workspace/channel/${encodeURIComponent(canvas.channelName)}?canvas=${canvas.id}`);
    }
  }

  const hasActiveFilters = activeStatuses.size > 0 || channelFilter || ownerFilter;

  return (
    <div className="flex-1 overflow-auto bg-[#1a1d21] text-white">
      <div className="max-w-5xl mx-auto p-6">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-slate-400" />
            <h1 className="text-xl font-bold tracking-tight">Canvases</h1>
          </div>
          <p className="text-[13px] text-slate-400">
            All canvases across channels in this workspace.
          </p>
        </div>

        {/* Search + sort bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex-1 min-w-48 max-w-72">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search canvases…"
              className="bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none w-full"
            />
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-white/20 cursor-pointer"
          >
            <option value="">All channels</option>
            {channelOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Owner filter */}
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-white/20 cursor-pointer"
          >
            <option value="">All owners</option>
            {ownerOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-[12px] text-slate-500 whitespace-nowrap">Sort</label>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-white/20 cursor-pointer"
            >
              <option value="updatedAt">Last updated</option>
              <option value="createdAt">Created</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>

        {/* Pipeline status chip filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[12px] text-slate-500 mr-1">Status:</span>
          {PIPELINE_STATUSES.map(({ key, label }) => {
            const isActive = activeStatuses.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleStatus(key)}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[12px] font-medium border transition-colors',
                  isActive
                    ? STATUS_CHIP_ACTIVE[key]
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
                )}
              >
                {label}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setActiveStatuses(new Set());
                setChannelFilter('');
                setOwnerFilter('');
              }}
              className="text-[12px] text-slate-500 hover:text-slate-300 underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading canvases…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <FileText className="w-10 h-10 text-slate-700" />
            <p className="text-sm font-medium text-slate-400">
              {q.trim() ? `No canvases matching "${q}"` : hasActiveFilters ? 'No canvases match these filters' : 'No canvases yet'}
            </p>
            <p className="text-[13px] text-slate-600">
              Canvases are created inside channels.
            </p>
          </div>
        )}

        {/* Count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-[12px] text-slate-600 mb-3">
            {filtered.length} {filtered.length === 1 ? 'canvas' : 'canvases'}
          </p>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div className="border border-white/10 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_120px_100px_90px] gap-x-3 px-4 py-2 bg-white/[0.03] border-b border-white/10">
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Title</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Channel</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Owner</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">Status</span>
              <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide text-right">Updated</span>
            </div>

            {/* Table rows */}
            {filtered.map((canvas, idx) => {
              const canNavigate = !!canvas.channelName;
              const status = canvas.pipelineStatus;
              return (
                <button
                  key={canvas.id}
                  onClick={() => openCanvas(canvas)}
                  disabled={!canNavigate}
                  className={cn(
                    'w-full grid grid-cols-[1fr_120px_120px_100px_90px] gap-x-3 px-4 py-2.5 text-left transition-colors',
                    idx > 0 && 'border-t border-white/5',
                    canNavigate
                      ? 'hover:bg-white/[0.04] cursor-pointer'
                      : 'opacity-60 cursor-default'
                  )}
                >
                  {/* Title + topic */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate leading-snug">
                      {canvas.title}
                    </p>
                    {canvas.topic && (
                      <p className="text-[12px] text-slate-500 truncate leading-relaxed">
                        {canvas.topic}
                      </p>
                    )}
                  </div>

                  {/* Channel */}
                  <div className="flex items-center min-w-0">
                    {canvas.channelName ? (
                      <span className="flex items-center gap-1 text-[13px] text-slate-400 truncate">
                        <Hash className="w-3 h-3 shrink-0" />
                        <span className="truncate">{canvas.channelName}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-slate-600">—</span>
                    )}
                  </div>

                  {/* Owner */}
                  <div className="flex items-center min-w-0">
                    {canvas.ownerName ? (
                      <span className="flex items-center gap-1 text-[13px] text-slate-400 truncate">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{canvas.ownerName}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-slate-600">—</span>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center">
                    {status ? (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize',
                        STATUS_COLORS[status]
                      )}>
                        {status === 'fact-checked' ? 'Checked' : status}
                      </span>
                    ) : (
                      <span className="text-[13px] text-slate-600">—</span>
                    )}
                  </div>

                  {/* Updated at */}
                  <div className="flex items-center justify-end gap-1 text-[12px] text-slate-500">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">{timeAgo(canvas.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
