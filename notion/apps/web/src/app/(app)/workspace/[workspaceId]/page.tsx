'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { apiFetch } from '@/lib/api';
import { useWorkspaceStore, type WorkspaceInfo } from '@/stores/workspace';

export default function WorkspaceHomePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { setCurrentWorkspace, setWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    async function load() {
      const workspaces = await apiFetch<WorkspaceInfo[]>('/api/v1/workspaces');
      setWorkspaces(workspaces);
      const current = workspaces.find((w) => w.id === workspaceId);
      if (current) setCurrentWorkspace(current);
    }
    load().catch(console.error);
  }, [workspaceId, setCurrentWorkspace, setWorkspaces]);

  async function handleNewPage() {
    const newPage = await apiFetch<{ id: string }>(
      `/api/v1/pages?workspace_id=${workspaceId}`,
      {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled' }),
      },
    );
    router.push(`/workspace/${workspaceId}/${newPage.id}`);
  }

  return (
    <div className="flex h-screen">
      <Sidebar workspaceId={workspaceId} />

      <main className="flex-1 overflow-y-auto">
        <header className="h-[44px] flex items-center justify-between px-4 border-b border-[var(--divider)]">
          <span className="text-sm text-[var(--text-secondary)]">Home</span>
        </header>

        <div className="mx-auto max-w-[900px] px-24 py-12">
          <h1 className="text-[40px] font-bold leading-[1.2] text-[var(--text-primary)]">
            Welcome to your workspace
          </h1>
          <p className="mt-4 text-[var(--text-secondary)]">
            Start by creating a new page.
          </p>
          <button
            onClick={handleNewPage}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-[var(--radius-sm)] text-sm font-medium hover:opacity-90 transition-opacity duration-[var(--duration-micro)]"
          >
            Create a page
          </button>
        </div>
      </main>
    </div>
  );
}
