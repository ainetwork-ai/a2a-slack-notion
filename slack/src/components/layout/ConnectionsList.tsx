'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, Link2, Plus, ShieldCheck } from 'lucide-react';
import useSWR from 'swr';
import { useAppStore } from '@/lib/stores/app-store';
import { cn } from '@/lib/utils';
import {
  connectionOrgName,
  connectionTeeParams,
  isSealedConnection,
} from '@/lib/connections/is-connection';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Agent {
  id: string;
  a2aId?: string | null;
  displayName?: string;
  name?: string;
  iconUrl?: string;
  avatarUrl?: string;
  a2aUrl?: string;
  agentCardJson?: unknown;
}

function dmKey(a: Agent): string {
  return a.a2aId || a.id;
}

export default function ConnectionsList() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { setConnectionInviteOpen } = useAppStore();

  const { data: agents } = useSWR<Agent[]>('/api/agents', fetcher, {
    refreshInterval: 30000,
  });

  const connections = (agents ?? []).filter((a) => isSealedConnection(a.agentCardJson));

  return (
    <div className="px-2 py-1">
      <div className="group flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#bcabbc] transition-colors hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          <Link2 className="h-3.5 w-3.5" />
          <span>Connections</span>
          {connections.length > 0 && (
            <span className="ml-1 text-[10px] text-[#bcabbc]/70">{connections.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setConnectionInviteOpen(true)}
          aria-label="Connect external data source"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5 text-[#bcabbc] hover:text-white" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {connections.length === 0 ? (
            <button
              type="button"
              onClick={() => setConnectionInviteOpen(true)}
              className="flex w-full items-center gap-2 rounded px-4 py-1.5 text-left text-xs text-[#bcabbc]/70 hover:bg-white/5 hover:text-white"
            >
              <Plus className="h-3 w-3" />
              Connect external data source
            </button>
          ) : (
            connections.map((a) => {
              const key = dmKey(a);
              const active = pathname?.includes(`/workspace/dm/${encodeURIComponent(key)}`);
              const card = a.agentCardJson as Record<string, unknown> | undefined;
              const org = connectionOrgName(card);
              const tee = connectionTeeParams(card);
              const hardware = (tee?.tee_hardware as string[] | undefined)?.join(' + ');

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => router.push(`/workspace/dm/${encodeURIComponent(key)}`)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded px-3 py-1.5 text-left transition-colors',
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-[#d9d2d9] hover:bg-white/5 hover:text-white'
                  )}
                  title={`Connected sealed data source${org ? ` · ${org}` : ''}`}
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{a.displayName || a.name}</div>
                    {org && (
                      <div className="truncate text-[10px] text-[#bcabbc]/70">
                        {org}
                      </div>
                    )}
                    {hardware && (
                      <div className="truncate text-[10px] text-emerald-400/80">
                        sealed · {hardware}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
