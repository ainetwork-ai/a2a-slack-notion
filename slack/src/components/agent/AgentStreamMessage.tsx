'use client';

import { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentStreamMessageProps {
  agentName: string;
  agentIcon?: string;
  content: string;
  isStreaming: boolean;
}

export default function AgentStreamMessage({
  agentName,
  agentIcon,
  content,
  isStreaming,
}: AgentStreamMessageProps) {
  const contentRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [content]);

  return (
    <div className="flex items-start gap-3 px-4 py-2 bg-[#36c5f0]/5 border-l-2 border-[#36c5f0]/40 rounded-r-lg mx-4 my-1">
      <Avatar className="w-9 h-9 mt-0.5 shrink-0">
        <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
          <Bot className="w-5 h-5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-white text-sm">{agentName}</span>
          <Badge className="text-[10px] px-1 py-0 h-4 bg-[#36c5f0]/20 text-[#36c5f0] border-[#36c5f0]/30">
            Bot
          </Badge>
          {isStreaming && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
              Responding...
            </Badge>
          )}
        </div>

        <p
          ref={contentRef}
          className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words"
        >
          {content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-[#36c5f0] ml-0.5 animate-pulse align-text-bottom" />
          )}
        </p>
      </div>
    </div>
  );
}
