'use client';

import { Hash, MessageSquare, Zap } from 'lucide-react';
import { useAppStore } from '@/lib/stores/app-store';

export default function WorkspacePage() {
  const { setCreateChannelOpen, setAgentInviteOpen, setSearchOpen } = useAppStore();

  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
      <div className="max-w-md">
        {/* Icon */}
        <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-[#4a154b]/30 border border-[#4a154b]/40 mx-auto mb-6">
          <MessageSquare className="w-10 h-10 text-[#e879f9]" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Welcome to Slack-A2A</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          Select a channel or direct message from the sidebar to start a conversation, or get started below.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setCreateChannelOpen(true)}
            className="flex items-center gap-3 p-4 bg-[#222529] border border-white/10 rounded-xl hover:bg-white/5 hover:border-white/20 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-[#4a154b]/30 flex items-center justify-center shrink-0 group-hover:bg-[#4a154b]/50 transition-colors">
              <Hash className="w-5 h-5 text-[#e879f9]" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Create a channel</p>
              <p className="text-slate-400 text-xs">Start a team conversation</p>
            </div>
          </button>

          <button
            onClick={() => setAgentInviteOpen(true)}
            className="flex items-center gap-3 p-4 bg-[#222529] border border-white/10 rounded-xl hover:bg-white/5 hover:border-white/20 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-[#36c5f0]/10 flex items-center justify-center shrink-0 group-hover:bg-[#36c5f0]/20 transition-colors">
              <Zap className="w-5 h-5 text-[#36c5f0]" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Invite an Agent</p>
              <p className="text-slate-400 text-xs">Connect an A2A-compatible agent</p>
            </div>
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-3 p-4 bg-[#222529] border border-white/10 rounded-xl hover:bg-white/5 hover:border-white/20 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-700/30 flex items-center justify-center shrink-0 group-hover:bg-slate-700/50 transition-colors">
              <MessageSquare className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Search messages</p>
              <p className="text-slate-400 text-xs">Find anything with Cmd+K</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
