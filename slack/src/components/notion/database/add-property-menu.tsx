'use client';

import {
  Type,
  AlignLeft,
  Hash,
  ChevronDown,
  List,
  Calendar,
  User,
  Paperclip,
  CheckSquare,
  Link,
  Mail,
  Phone,
  CircleDot,
  Clock,
  UserPlus,
  UserCheck,
  FunctionSquare,
  ArrowUpRight,
  Calculator,
} from 'lucide-react';
// TODO(notion-migration): @/lib/notion/shared not yet scaffolded — another agent imports from @notion/shared.
import type { PropertyType } from '@/lib/notion/shared';
import { cn } from '@/lib/utils';

interface PropertyTypeOption {
  type: PropertyType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const PROPERTY_TYPES: PropertyTypeOption[] = [
  { type: 'text', label: 'Text', icon: AlignLeft },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'select', label: 'Select', icon: ChevronDown },
  { type: 'multi_select', label: 'Multi-select', icon: List },
  { type: 'status', label: 'Status', icon: CircleDot },
  { type: 'date', label: 'Date', icon: Calendar },
  { type: 'person', label: 'Person', icon: User },
  { type: 'files', label: 'Files & media', icon: Paperclip },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'url', label: 'URL', icon: Link },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'phone', label: 'Phone', icon: Phone },
  { type: 'formula', label: 'Formula', icon: FunctionSquare },
  { type: 'relation', label: 'Relation', icon: ArrowUpRight },
  { type: 'rollup', label: 'Rollup', icon: Calculator },
  { type: 'created_time', label: 'Created time', icon: Clock },
  { type: 'created_by', label: 'Created by', icon: UserPlus },
  { type: 'last_edited_time', label: 'Last edited time', icon: Clock },
  { type: 'last_edited_by', label: 'Last edited by', icon: UserCheck },
];

export { PROPERTY_TYPES };
export type { PropertyTypeOption };

interface AddPropertyMenuProps {
  onSelect: (type: PropertyType) => void;
}

export function AddPropertyMenu({ onSelect }: AddPropertyMenuProps) {
  return (
    <div className="p-1 min-w-[200px]">
      <p className="px-2 py-1 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
        Property Type
      </p>
      {PROPERTY_TYPES.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type)}
          className={cn(
            'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[3px] text-sm text-[var(--text-primary)] text-left',
            'hover:bg-[var(--bg-hover)] transition-colors duration-[var(--duration-micro)]',
          )}
        >
          <Icon size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}

// Standalone icon helper
export function PropertyIcon({
  type,
  size = 14,
  className,
}: {
  type: PropertyType;
  size?: number;
  className?: string;
}) {
  const found = PROPERTY_TYPES.find((p) => p.type === type);
  const titleEntry = { type: 'title' as PropertyType, label: 'Title', icon: Type };
  const entry = type === 'title' ? titleEntry : found;
  if (!entry) return null;
  const Icon = entry.icon;
  return <Icon size={size} className={className} />;
}
