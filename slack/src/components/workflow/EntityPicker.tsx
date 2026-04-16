'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { ChevronDown, Bot, Hash, Lock, User, Wrench, X } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type Kind = 'agent' | 'channel' | 'user' | 'skill';

interface PickerOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface EntityPickerProps {
  kind: Kind;
  value: string;
  onChange: (value: string, option?: PickerOption) => void;
  placeholder?: string;
  /** For skill picker: agent id whose skills to show. */
  agentId?: string;
  /** Optional: restrict picker to built (local) agents only (for ask_agent workflows). */
  onlyBuilt?: boolean;
  /** Allow clearing the selection. */
  clearable?: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useOptions(kind: Kind, agentId?: string, onlyBuilt?: boolean): PickerOption[] {
  const agentUrl = kind === 'agent' || kind === 'skill' ? '/api/agents' : null;
  const channelUrl = kind === 'channel' ? '/api/channels' : null;
  const userUrl = kind === 'user' ? '/api/users' : null;

  const { data: agents } = useSWR<Array<Record<string, unknown>>>(agentUrl, fetcher);
  const { data: channels } = useSWR<Array<Record<string, unknown>>>(channelUrl, fetcher);
  const { data: usersResp } = useSWR<{ users: Array<Record<string, unknown>> }>(userUrl, fetcher);

  return useMemo(() => {
    if (kind === 'agent') {
      const list = agents ?? [];
      return list
        .filter((a) => {
          if (!onlyBuilt) return true;
          const url = (a.a2aUrl as string) || '';
          // Built (local) agents have URLs pointing at this app's /api/a2a path,
          // or have no external URL at all.
          return !url || url.includes('/api/a2a/');
        })
        .map((a) => ({
          // Prefer the natural a2aId (e.g. "bitcoinnewsresearcher") so configs stay
          // readable. Fall back to UUID for agents that pre-date the a2aId column.
          value: (a.a2aId as string) || (a.id as string),
          label: (a.displayName as string) || 'Agent',
          description: (a.agentCardJson as { description?: string })?.description,
          meta: (a.a2aId as string) || undefined,
          icon: <Bot className="w-4 h-4 text-[#e879f9]" />,
        }));
    }

    if (kind === 'skill') {
      const agent = (agents ?? []).find(
        (a) => a.id === agentId || a.a2aId === agentId
      );
      if (!agent) return [];
      const skills = ((agent.agentCardJson as { skills?: Array<Record<string, unknown>> })?.skills) ?? [];
      return skills.map((s) => ({
        value: (s.id as string) || (s.name as string),
        label: (s.name as string) || (s.id as string) || 'Skill',
        description: s.description as string,
        meta: Array.isArray(s.tags) ? (s.tags as string[]).join(', ') : undefined,
        icon: <Wrench className="w-4 h-4 text-yellow-400" />,
      }));
    }

    if (kind === 'channel') {
      const list = channels ?? [];
      return list.map((c) => ({
        value: c.id as string,
        label: `#${c.name}`,
        description: (c.description as string) || undefined,
        icon: c.isPrivate ? (
          <Lock className="w-4 h-4 text-slate-400" />
        ) : (
          <Hash className="w-4 h-4 text-slate-400" />
        ),
      }));
    }

    if (kind === 'user') {
      const list = usersResp?.users ?? [];
      return list.map((u) => ({
        value: u.id as string,
        label: u.displayName as string,
        description: u.ainAddress as string | undefined,
        icon: <User className="w-4 h-4 text-cyan-400" />,
      }));
    }

    return [];
  }, [kind, agents, channels, usersResp, agentId, onlyBuilt]);
}

function labelFor(kind: Kind) {
  switch (kind) {
    case 'agent':
      return 'Select agent…';
    case 'skill':
      return 'Pick a skill';
    case 'channel':
      return 'Select channel…';
    case 'user':
      return 'Select user…';
  }
}

export default function EntityPicker({
  kind,
  value,
  onChange,
  placeholder,
  agentId,
  onlyBuilt,
  clearable,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const options = useOptions(kind, agentId, onlyBuilt);
  const selected = options.find((o) => o.value === value);
  const disabled = kind === 'skill' && !agentId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-2 h-9 px-3 rounded-md border bg-[#0f1114] border-white/10 text-sm text-left transition-colors',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-white/20 cursor-pointer',
          !selected && 'text-slate-500'
        )}
      >
        {selected ? (
          <>
            {selected.icon}
            <span className="text-white truncate">{selected.label}</span>
            {selected.meta && (
              <span className="text-xs text-slate-500 truncate ml-auto mr-2">
                {selected.meta}
              </span>
            )}
          </>
        ) : (
          <span className="truncate">
            {disabled ? 'Pick an agent first' : placeholder || labelFor(kind)}
          </span>
        )}
        {clearable && selected ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onChange('');
              }
            }}
            className="ml-auto text-slate-500 hover:text-red-400 cursor-pointer"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-auto shrink-0" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px] bg-[#1a1d21] border-white/10"
      >
        <Command className="bg-[#1a1d21]">
          <CommandInput placeholder={`Search ${kind}s…`} />
          <CommandList>
            <CommandEmpty className="text-slate-500">No {kind}s found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.description ?? ''} ${opt.meta ?? ''}`}
                  onSelect={() => {
                    onChange(opt.value, opt);
                    setOpen(false);
                  }}
                  data-checked={opt.value === value}
                  className="cursor-pointer"
                >
                  {opt.icon}
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm truncate">{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-slate-500 truncate">{opt.description}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
