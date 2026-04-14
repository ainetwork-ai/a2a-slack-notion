'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bot, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentCardData {
  name: string;
  description?: string;
  iconUrl?: string;
  version?: string;
  provider?: string;
  url?: string;
  skills?: Array<{
    id: string;
    name: string;
    description?: string;
    tags?: string[];
  }>;
  status?: 'online' | 'offline' | 'busy';
}

interface AgentCardProps {
  agent: AgentCardData;
  compact?: boolean;
  className?: string;
}

const statusColors = {
  online: 'bg-green-400',
  offline: 'bg-slate-500',
  busy: 'bg-yellow-400',
};

const statusLabels = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
};

export default function AgentCard({ agent, compact, className }: AgentCardProps) {
  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className="relative shrink-0">
          <Avatar className="w-8 h-8">
            {agent.iconUrl && <AvatarImage src={agent.iconUrl} alt={agent.name} />}
            <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0] text-xs">
              <Bot className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          {agent.status && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1a1d21]',
                statusColors[agent.status]
              )}
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white truncate">{agent.name}</span>
            <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30 shrink-0">
              Bot
            </Badge>
          </div>
          {agent.description && (
            <p className="text-xs text-slate-400 truncate">{agent.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-[#222529] border border-white/10 rounded-xl p-4', className)}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="relative shrink-0">
          <Avatar className="w-12 h-12">
            {agent.iconUrl && <AvatarImage src={agent.iconUrl} alt={agent.name} />}
            <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
              <Bot className="w-6 h-6" />
            </AvatarFallback>
          </Avatar>
          {agent.status && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#222529]',
                statusColors[agent.status]
              )}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white">{agent.name}</h3>
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">
              A2A Agent
            </Badge>
            {agent.status && (
              <Badge
                className={cn(
                  'text-[10px] px-1.5 py-0 h-4 border',
                  agent.status === 'online'
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : agent.status === 'busy'
                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                )}
              >
                {statusLabels[agent.status]}
              </Badge>
            )}
          </div>
          {agent.provider && (
            <p className="text-xs text-slate-500 mt-0.5">by {agent.provider}</p>
          )}
          {agent.version && (
            <p className="text-xs text-slate-600">v{agent.version}</p>
          )}
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-sm text-slate-300 mb-3 leading-relaxed">{agent.description}</p>
      )}

      {/* Skills */}
      {agent.skills && agent.skills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-[#36c5f0]" />
            <span className="text-xs font-medium text-slate-400">Skills</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.skills.map(skill => (
              <Badge
                key={skill.id}
                variant="outline"
                className="text-xs text-slate-300 border-white/10 bg-white/5 hover:bg-white/10"
                title={skill.description}
              >
                {skill.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
