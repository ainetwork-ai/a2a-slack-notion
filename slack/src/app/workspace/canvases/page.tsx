'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { FileText, Search, Loader2, Clock, Hash } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type SortKey = 'updatedAt' | 'createdAt' | 'title';

interface CanvasItem {
  id: string;
  title: string;
  topic: string | null;
  content: string;
  channelId: string | null;
  updatedAt: string;
  createdAt: string;
  pipelineStatus: string | null;
}

interface ChannelInfo {
  id: string;
  name: string;
}

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

  const apiUrl = activeWorkspaceName
    ? `/api/canvases?workspaceId=${encodeURIComponent(activeWorkspaceName)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`
    : null;

  const { data: canvasesRaw, isLoading } = useSWR<CanvasItem[]>(apiUrl, fetcher, {
    keepPreviousData: true,
  });

  // Collect unique channelIds to resolve names
  const channelIds = [...new Set((canvasesRaw ?? []).map(c => c.channelId).filter(Boolean))] as string[];
  const { data: channelsData } = useSWR<ChannelInfo[]>(
    channelIds.length > 0 ? `/api/channels?ids=${channelIds.join(',')}` : null,
    fetcher
  );

  // Build channelId -> name map; fall back to id fragment if API doesn't support ?ids=
  const channelMap = new Map<string, string>();
  if (Array.isArray(channelsData)) {
    for (const ch of channelsData) {
      channelMap.set(ch.id, ch.name);
    }
  }

  // Sort client-side (API already filters by q)
  const sorted = [...(canvasesRaw ?? [])].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    const aVal = sort === 'createdAt' ? a.createdAt : a.updatedAt;
    const bVal = sort === 'createdAt' ? b.createdAt : b.updatedAt;
    return new Date(bVal).getTime() - new Date(aVal).getTime();
  });

  function openCanvas(canvas: CanvasItem) {
    const channelName = canvas.channelId ? channelMap.get(canvas.channelId) : null;
    if (channelName) {
      router.push(`/workspace/channel/${encodeURIComponent(channelName)}?canvas=1`);
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-[#1a1d21] text-white">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-6 h-6 text-slate-400" />
            <h1 className="text-2xl font-bold">Canvases</h1>
          </div>
          <p className="text-slate-400 text-sm">
            All canvases across channels you belong to.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-48 max-w-80">
            <Search className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search canvases…"
              className="bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">Sort by</label>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 cursor-pointer"
            >
              <option value="updatedAt">Last updated</option>
              <option value="createdAt">Created</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading canvases…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <FileText className="w-12 h-12 text-slate-700" />
            <p className="text-base font-medium text-slate-400">
              {q.trim() ? `No canvases matching "${q}"` : 'No canvases yet'}
            </p>
            <p className="text-sm text-slate-600">
              Canvases are created inside channels.
            </p>
          </div>
        )}

        {/* Grid */}
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(canvas => {
              const channelName = canvas.channelId ? channelMap.get(canvas.channelId) : null;
              const canNavigate = !!channelName;
              return (
                <button
                  key={canvas.id}
                  onClick={() => openCanvas(canvas)}
                  disabled={!canNavigate}
                  className={cn(
                    'text-left bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2 transition-colors group',
                    canNavigate
                      ? 'hover:bg-white/8 hover:border-white/20 cursor-pointer'
                      : 'opacity-60 cursor-default'
                  )}
                >
                  {/* Title */}
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-white truncate leading-snug">
                      {canvas.title}
                    </p>
                  </div>

                  {/* Topic */}
                  {canvas.topic && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {canvas.topic}
                    </p>
                  )}

                  {/* Content preview (if no topic) */}
                  {!canvas.topic && canvas.content && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {canvas.content.slice(0, 120)}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                    {channelName && (
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-white/5 rounded px-1.5 py-0.5">
                        <Hash className="w-3 h-3" />
                        {channelName}
                      </span>
                    )}
                    {canvas.pipelineStatus && (
                      <span className="text-xs text-slate-600 bg-white/5 rounded px-1.5 py-0.5 capitalize">
                        {canvas.pipelineStatus}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-slate-600 ml-auto">
                      <Clock className="w-3 h-3" />
                      {timeAgo(canvas.updatedAt)}
                    </span>
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
