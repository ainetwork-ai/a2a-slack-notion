'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, FileText, Loader2, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface PageTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  workspaceId: string;
}

interface TemplateGalleryProps {
  workspaceId: string;
  parentId?: string;
  onClose: () => void;
  onPageCreated?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  work: 'Work',
  engineering: 'Engineering',
  personal: 'Personal',
  custom: 'Custom',
};

export function TemplateGallery({ workspaceId, parentId, onClose, onPageCreated }: TemplateGalleryProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ templates: PageTemplate[] }>(`/api/v1/templates?workspace_id=${workspaceId}`)
      .then((data) => setTemplates(data.templates))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load templates'))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const categories = ['all', ...Array.from(new Set(templates.map((t) => t.category)))];

  const filtered =
    activeCategory === 'all' ? templates : templates.filter((t) => t.category === activeCategory);

  function afterPageCreated(pageId: string) {
    onPageCreated?.();
    onClose();
    router.push(`/workspace/${workspaceId}/${pageId}`);
  }

  async function handleNewDatabase() {
    try {
      setApplying('database');
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (parentId) params.set('parent_id', parentId);
      const newPage = await apiFetch<{ id: string }>(
        `/api/v1/pages?${params.toString()}`,
        { method: 'POST', body: JSON.stringify({ title: 'Untitled Database' }) },
      );
      await apiFetch(`/api/v1/databases`, {
        method: 'POST',
        body: JSON.stringify({ parentId: newPage.id, workspaceId }),
      });
      afterPageCreated(newPage.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create database');
      setApplying(null);
    }
  }

  async function handleBlankPage() {
    try {
      setApplying('blank');
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (parentId) params.set('parent_id', parentId);
      const newPage = await apiFetch<{ id: string }>(
        `/api/v1/pages?${params.toString()}`,
        { method: 'POST', body: JSON.stringify({ title: 'Untitled' }) },
      );
      afterPageCreated(newPage.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
      setApplying(null);
    }
  }

  async function handleApplyTemplate(template: PageTemplate) {
    try {
      setApplying(template.id);
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (parentId) params.set('parent_id', parentId);
      const newPage = await apiFetch<{ id: string }>(
        `/api/v1/templates/${template.id}/apply?${params.toString()}`,
        { method: 'POST' },
      );
      afterPageCreated(newPage.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
      setApplying(null);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      {/* Dialog — full-screen on mobile, constrained on tablet/desktop */}
      <div
        className="relative flex flex-col bg-[var(--bg-default)] rounded-none md:rounded-[var(--radius-md)] shadow-[var(--shadow-modal)] w-full md:w-[720px] h-full md:h-auto md:max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--divider)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">New page</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]"
          >
            <X size={16} className="text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-2 shrink-0 border-b border-[var(--divider)]">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-3 py-1 text-xs rounded-full transition-colors duration-[var(--duration-micro)]',
                activeCategory === cat
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="text-xs text-red-500 mb-3">{error}</p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Blank page card */}
              <TemplateCard
                icon="📄"
                name="Blank page"
                description="Start from scratch"
                category=""
                loading={applying === 'blank'}
                onClick={handleBlankPage}
              />

              {/* New Database card */}
              <button
                onClick={handleNewDatabase}
                disabled={applying === 'database'}
                className={cn(
                  'group flex flex-col items-start text-left p-4 rounded-[var(--radius-md)] border border-transparent',
                  'hover:bg-[var(--bg-hover)] hover:border-[var(--divider)]',
                  'transition-all duration-[var(--duration-micro)] disabled:opacity-60 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]',
                )}
              >
                <div className="flex items-center gap-2 mb-2 w-full">
                  {applying === 'database' ? (
                    <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)] shrink-0" />
                  ) : (
                    <Table2 size={24} className="text-[var(--accent-blue)] shrink-0" />
                  )}
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">New Database</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-snug">Create a table, board, or list</p>
              </button>

              {/* Template cards */}
              {filtered.map((tmpl) => (
                <TemplateCard
                  key={tmpl.id}
                  icon={tmpl.icon ?? '📄'}
                  name={tmpl.name}
                  description={tmpl.description ?? ''}
                  category={tmpl.category}
                  loading={applying === tmpl.id}
                  onClick={() => handleApplyTemplate(tmpl)}
                />
              ))}

              {filtered.length === 0 && activeCategory !== 'all' && (
                <p className="col-span-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  No templates in this category yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  icon: string;
  name: string;
  description: string;
  category: string;
  loading: boolean;
  onClick: () => void;
}

function TemplateCard({ icon, name, description, category, loading, onClick }: TemplateCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'group flex flex-col items-start text-left p-4 rounded-[var(--radius-md)] border border-transparent',
        'hover:bg-[var(--bg-hover)] hover:border-[var(--divider)]',
        'transition-all duration-[var(--duration-micro)] disabled:opacity-60 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-blue)]',
      )}
    >
      <div className="flex items-center gap-2 mb-2 w-full">
        {loading ? (
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)] shrink-0" />
        ) : icon.length <= 2 ? (
          <span className="text-2xl leading-none shrink-0">{icon}</span>
        ) : (
          <FileText size={24} className="text-[var(--text-tertiary)] shrink-0" />
        )}
        {category && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-active)] text-[var(--text-tertiary)] uppercase tracking-wide shrink-0">
            {category}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{name}</p>
      {description && (
        <p className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-snug line-clamp-2">
          {description}
        </p>
      )}
    </button>
  );
}
