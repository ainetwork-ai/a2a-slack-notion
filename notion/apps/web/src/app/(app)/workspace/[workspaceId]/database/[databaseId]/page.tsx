'use client';

import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/sidebar/sidebar';
import { Breadcrumb } from '@/components/breadcrumb';
import { DatabaseView } from '@/components/database/database-view';

export default function DatabasePage() {
  const { workspaceId, databaseId } = useParams<{
    workspaceId: string;
    databaseId: string;
  }>();

  return (
    <div className="flex h-screen">
      <Sidebar workspaceId={workspaceId} activePageId={databaseId} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-[44px] flex items-center px-4 border-b border-[var(--divider)] flex-shrink-0">
          <Breadcrumb workspaceId={workspaceId} pageId={databaseId} />
        </header>

        {/* Full-page database view */}
        <div className="flex-1 overflow-hidden">
          <DatabaseView databaseId={databaseId} />
        </div>
      </main>
    </div>
  );
}
