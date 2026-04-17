'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { PermissionLevel } from './use-page-permissions';

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  full_access: 'Full access',
  can_edit: 'Can edit',
  can_comment: 'Can comment',
  can_view: 'Can view',
};

const LEVELS: PermissionLevel[] = ['full_access', 'can_edit', 'can_comment', 'can_view'];

interface PermissionLevelSelectProps {
  value: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
}

export function PermissionLevelSelect({ value, onChange, disabled }: PermissionLevelSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg px-2 h-7 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        {LEVEL_LABELS[value]}
        <ChevronDown className="w-3 h-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-[#1a1d21] border-white/10 text-white min-w-[140px]">
        {LEVELS.map(level => (
          <DropdownMenuItem
            key={level}
            onClick={() => onChange(level)}
            className={
              level === value
                ? 'text-white bg-white/10'
                : 'text-slate-300 hover:text-white focus:text-white focus:bg-white/10'
            }
          >
            {LEVEL_LABELS[level]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
