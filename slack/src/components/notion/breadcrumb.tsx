'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { apiFetch } from '@/lib/notion/api';

interface BreadcrumbItem {
  id: string;
  title: string;
  icon: string | null;
}

interface BreadcrumbProps {
  workspaceId: string;
  pageId: string;
  refreshKey?: number;
}

export function Breadcrumb({ workspaceId, pageId, refreshKey }: BreadcrumbProps) {
  const router = useRouter();
  const [ancestors, setAncestors] = useState<BreadcrumbItem[]>([]);

  useEffect(() => {
    apiFetch<BreadcrumbItem[]>(`/api/v1/pages/${pageId}/breadcrumb`)
      .then(setAncestors)
      .catch(console.error);
  }, [pageId, refreshKey]);

  return (
    <nav className="flex items-center gap-0.5 text-sm text-[var(--text-secondary)] min-w-0">
      {ancestors.map((item, i) => (
        <span key={item.id} className="flex items-center gap-0.5 min-w-0">
          {i > 0 && <ChevronRight size={12} className="shrink-0 text-[var(--text-tertiary)]" />}
          <button
            onClick={() => router.push(`/notion/workspace/${workspaceId}/${item.id}`)}
            className="truncate hover:text-[var(--text-primary)] transition-colors duration-[var(--duration-micro)] max-w-[200px]"
          >
            {item.icon && <span className="mr-1">{item.icon}</span>}
            {item.title || 'Untitled'}
          </button>
        </span>
      ))}
    </nav>
  );
}
