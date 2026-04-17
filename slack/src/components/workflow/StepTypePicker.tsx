'use client';

import { X } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow/types';

interface StepTypeOption {
  type: WorkflowStep['type'];
  icon: string;
  label: string;
  category: string;
}

const STEP_TYPE_OPTIONS: StepTypeOption[] = [
  // Agents — primary
  { type: 'invoke_skill', icon: '⚡', label: 'Invoke an agent skill', category: 'Agents' },
  { type: 'ask_agent', icon: '🤖', label: 'Ask an agent (legacy)', category: 'Agents' },
  // Canvas
  { type: 'write_canvas', icon: '📄', label: 'Write to a channel canvas', category: 'Canvas' },
  // Messages
  { type: 'send_message', icon: '💬', label: 'Send a message', category: 'Messages' },
  { type: 'form', icon: '📥', label: 'Collect input from a form', category: 'Messages' },
  { type: 'post_to_channel', icon: '↩️', label: 'Post to channel', category: 'Messages' },
  // People
  { type: 'dm_user', icon: '👤', label: 'Send a DM to a user', category: 'People' },
  { type: 'add_to_channel', icon: '➕', label: 'Add a user to a channel', category: 'People' },
  { type: 'approval', icon: '✅', label: 'Request approval', category: 'People' },
  // Logic
  { type: 'condition', icon: '🔀', label: 'If/else condition', category: 'Logic' },
  { type: 'wait', icon: '⏱️', label: 'Wait for time', category: 'Logic' },
  // Channels
  { type: 'create_channel', icon: '📝', label: 'Create channel', category: 'Channels' },
];

const CATEGORIES = ['Agents', 'Canvas', 'Messages', 'People', 'Logic', 'Channels'];

interface StepTypePickerProps {
  onSelect: (type: WorkflowStep['type']) => void;
  onClose: () => void;
}

export default function StepTypePicker({ onSelect, onClose }: StepTypePickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1d21] border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-semibold">Add a step</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {CATEGORIES.map((cat) => {
            const items = STEP_TYPE_OPTIONS.filter((o) => o.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {cat}
                </p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => onSelect(item.type)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/8 transition-colors text-left"
                    >
                      <span className="text-xl w-7 text-center">{item.icon}</span>
                      <span className="text-white text-sm">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
