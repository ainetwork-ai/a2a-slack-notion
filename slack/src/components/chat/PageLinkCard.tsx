'use client';

import useSWR from 'swr';
import { FileText } from 'lucide-react';

interface PageBlock {
  id: string;
  type: string;
  properties: {
    title?: string;
    icon?: string;
    cover?: string;
  } | null;
  content: unknown;
}

interface PageResponse {
  page: PageBlock;
  blocks: PageBlock[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function extractExcerpt(blocks: PageBlock[]): string {
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'text') {
      const props = block.properties as Record<string, unknown> | null;
      const text = props?.text ?? props?.content;
      if (typeof text === 'string' && text.trim()) return text.trim();
      // content may be an array of inline nodes
      if (Array.isArray(block.content)) {
        const joined = (block.content as { text?: string }[])
          .map((n) => n.text ?? '')
          .join('');
        if (joined.trim()) return joined.trim();
      }
    }
  }
  return '';
}

/** Skeleton shown while loading */
function CardSkeleton() {
  return (
    <div className="mt-2 max-w-[420px] flex gap-3 bg-[#1a1d21] border border-white/10 rounded-lg p-3 animate-pulse">
      <div className="w-8 h-8 rounded bg-white/10 shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-3 bg-white/10 rounded w-3/4" />
        <div className="h-2.5 bg-white/10 rounded w-full" />
        <div className="h-2.5 bg-white/10 rounded w-2/3" />
      </div>
    </div>
  );
}

interface PageLinkCardProps {
  pageId: string;
}

export default function PageLinkCard({ pageId }: PageLinkCardProps) {
  const { data, error, isLoading } = useSWR<PageResponse>(
    `/api/pages/${pageId}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  if (isLoading) return <CardSkeleton />;
  // On error or missing page: collapse to nothing (raw URL still visible in body)
  if (error || !data?.page) return null;

  const { page, blocks } = data;
  const props = page.properties ?? {};
  const title = props.title ?? 'Untitled';
  const icon = props.icon ?? null;
  const excerpt = extractExcerpt(blocks);
  const href = `/pages/${pageId}`;

  return (
    <a
      href={href}
      className="mt-2 max-w-[420px] flex gap-3 bg-[#1a1d21] border border-white/10 rounded-lg p-3 hover:bg-white/[0.04] transition-colors no-underline group block"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0 text-lg leading-none select-none">
        {icon ? (
          <span>{icon}</span>
        ) : (
          <FileText className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate group-hover:text-[#1d9bd1] transition-colors">
          {title}
        </p>
        {excerpt && (
          <p className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
            {excerpt}
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5 text-right">
          Open page →
        </p>
      </div>
    </a>
  );
}
