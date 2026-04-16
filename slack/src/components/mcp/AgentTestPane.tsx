'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAgentStream } from '@/lib/realtime/use-agent-stream';
import { cn } from '@/lib/utils';

interface TestMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentTestPaneProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export default function AgentTestPane({ agentId, agentName, onClose }: AgentTestPaneProps) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentStream = useAgentStream();

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStream.content]);

  // When streaming completes, add the response to messages
  useEffect(() => {
    if (!agentStream.isStreaming && agentStream.content) {
      setMessages(prev => [...prev, { role: 'assistant', content: agentStream.content }]);
      agentStream.reset();
      setIsSending(false);
    }
  }, [agentStream.isStreaming, agentStream.content]);

  function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsSending(true);

    agentStream.startStream({
      agentId,
      text,
      senderName: 'Tester',
    });
  }

  function handleReset() {
    setMessages([]);
    agentStream.reset();
    setIsSending(false);
  }

  return (
    <div className="flex flex-col w-96 border-l border-white/5 bg-[#1a1d21] shrink-0 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Avatar className="w-6 h-6">
            <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
              <Bot className="w-3.5 h-3.5" />
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-white text-sm">{agentName}</span>
          <Badge className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/20 text-amber-400 border-amber-500/30">Test</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={handleReset}
            className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="w-7 h-7 text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !agentStream.isStreaming && (
          <div className="text-center py-8">
            <Bot className="w-8 h-8 text-[#36c5f0]/30 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Test <strong>{agentName}</strong></p>
            <p className="text-xs text-slate-600 mt-1">Send a message to see how the agent responds</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : '')}>
            {msg.role === 'assistant' && (
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
                  <Bot className="w-3 h-3" />
                </AvatarFallback>
              </Avatar>
            )}
            <div className={cn(
              'rounded-lg px-3 py-2 text-sm max-w-[85%]',
              msg.role === 'user'
                ? 'bg-[#4a154b] text-white'
                : 'bg-[#222529] border border-white/5 text-slate-300'
            )}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {agentStream.isStreaming && (
          <div className="flex gap-2">
            <Avatar className="w-6 h-6 shrink-0 mt-0.5">
              <AvatarFallback className="bg-[#36c5f0]/20 text-[#36c5f0]">
                <Bot className="w-3 h-3" />
              </AvatarFallback>
            </Avatar>
            <div className="bg-[#222529] border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-300 max-w-[85%]">
              {agentStream.status && !agentStream.content && (
                <p className="text-xs text-slate-500 italic mb-1">{agentStream.status}</p>
              )}
              {agentStream.content ? (
                <p className="whitespace-pre-wrap leading-relaxed">{agentStream.content}<span className="animate-pulse text-[#36c5f0]">|</span></p>
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-1.5 h-1.5 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#36c5f0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-1 border-t border-white/5 shrink-0">
        <div className="flex items-end gap-2 bg-[#222529] border border-white/10 rounded-lg px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${agentName}...`}
            rows={1}
            disabled={isSending}
            className="flex-1 bg-transparent text-white placeholder:text-slate-600 text-sm resize-none focus:outline-none leading-relaxed max-h-24 overflow-y-auto"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={cn(
              'w-7 h-7 shrink-0',
              input.trim()
                ? 'bg-[#007a5a] hover:bg-[#148567] text-white'
                : 'bg-transparent text-slate-600'
            )}
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
