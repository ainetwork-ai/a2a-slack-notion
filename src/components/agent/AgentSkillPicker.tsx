'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Zap, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
}

interface AgentSkillPickerProps {
  skills: AgentSkill[];
  selectedSkill?: AgentSkill | null;
  onSelect: (skill: AgentSkill | null) => void;
}

export default function AgentSkillPicker({ skills, selectedSkill, onSelect }: AgentSkillPickerProps) {
  const [open, setOpen] = useState(false);

  if (skills.length === 0) return null;

  return (
    <div className="px-4 pb-2 flex items-center gap-2">
      <Zap className="w-4 h-4 text-[#36c5f0] shrink-0" />
      <span className="text-xs text-slate-400 shrink-0">Skill:</span>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex items-center gap-1.5 h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
            'border-white/10 bg-[#222529] text-white hover:bg-white/10 hover:text-white',
            'focus:outline-none'
          )}
        >
          {selectedSkill ? selectedSkill.name : <span className="text-slate-400">Select a skill...</span>}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="bg-[#222529] border-white/10 text-white min-w-[280px]"
          align="start"
        >
          <DropdownMenuLabel className="text-slate-400 text-xs">Agent Skills</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />

          {selectedSkill && (
            <>
              <DropdownMenuItem
                onClick={() => { onSelect(null); setOpen(false); }}
                className="text-slate-400 hover:bg-white/10 cursor-pointer text-xs"
              >
                Clear selection
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
            </>
          )}

          {skills.map(skill => (
            <DropdownMenuItem
              key={skill.id}
              onClick={() => { onSelect(skill); setOpen(false); }}
              className="hover:bg-white/10 cursor-pointer flex flex-col items-start gap-1 py-2"
            >
              <div className="flex items-center gap-2 w-full">
                <Zap className="w-3.5 h-3.5 text-[#36c5f0] shrink-0" />
                <span className="font-medium text-sm">{skill.name}</span>
                {selectedSkill?.id === skill.id && (
                  <span className="ml-auto text-[#36c5f0] text-xs">Selected</span>
                )}
              </div>
              {skill.description && (
                <p className="text-xs text-slate-400 pl-5 leading-snug">{skill.description}</p>
              )}
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-5 mt-0.5">
                  {skill.tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-1 py-0 h-4 border-white/10 text-slate-400"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
