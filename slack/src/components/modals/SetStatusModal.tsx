'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SetStatusModalProps {
  open: boolean;
  onClose: () => void;
  currentEmoji?: string;
  currentMessage?: string;
}

const PRESET_STATUSES = [
  { emoji: '🎯', text: 'Focusing' },
  { emoji: '🏖️', text: 'On vacation' },
  { emoji: '🤒', text: 'Out sick' },
  { emoji: '🚌', text: 'Commuting' },
  { emoji: '🍔', text: 'Out for lunch' },
  { emoji: '🎉', text: 'In a meeting' },
  { emoji: '💤', text: 'Away' },
  { emoji: '🏠', text: 'Working remotely' },
];

const QUICK_EMOJIS = ['🎯', '💬', '🏖️', '🤒', '🚌', '🍔', '🎉', '💤', '🏠', '✈️', '📚', '🎮'];

const EXPIRY_PRESETS = [
  { label: "Don't clear", value: null },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '4 hours', value: 4 * 60 * 60 * 1000 },
  { label: 'Today', value: 'today' as const },
  { label: 'This week', value: 'week' as const },
];

type ExpiryValue = number | 'today' | 'week' | null;

function resolveExpiry(value: ExpiryValue): string | null {
  if (value === null) return null;
  const now = new Date();
  if (value === 'today') {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  if (value === 'week') {
    const end = new Date(now);
    const day = end.getDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    end.setDate(end.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }
  return new Date(now.getTime() + value).toISOString();
}

export default function SetStatusModal({ open, onClose, currentEmoji, currentMessage }: SetStatusModalProps) {
  const [emoji, setEmoji] = useState(currentEmoji ?? '');
  const [message, setMessage] = useState(currentMessage ?? '');
  const [expiry, setExpiry] = useState<ExpiryValue>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const statusExpiresAt = resolveExpiry(expiry);
      await fetch('/api/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statusMessage: message,
          statusEmoji: emoji || null,
          statusExpiresAt,
        }),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await fetch('/api/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusMessage: '', statusEmoji: null, statusExpiresAt: null }),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#222529] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Set a status</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-1">
          {/* Status input row */}
          <div className="flex gap-2 items-center">
            <div className="relative">
              <button
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#1a1d21] border border-white/10 text-xl hover:bg-white/10 transition-colors"
                title="Selected emoji"
              >
                {emoji || '😀'}
              </button>
            </div>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's your status?"
              className="flex-1 bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-500 focus:border-[#4a154b]"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>

          {/* Quick emoji picker */}
          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Quick emoji</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded text-lg hover:bg-white/10 transition-colors',
                    emoji === e && 'bg-[#4a154b]/50 ring-1 ring-[#4a154b]'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Preset statuses */}
          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Suggested</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_STATUSES.map((p) => (
                <button
                  key={p.text}
                  onClick={() => { setEmoji(p.emoji); setMessage(p.text); }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left hover:bg-white/10 transition-colors',
                    emoji === p.emoji && message === p.text
                      ? 'bg-[#4a154b]/40 text-white'
                      : 'text-slate-300'
                  )}
                >
                  <span className="text-base">{p.emoji}</span>
                  <span>{p.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Clear status after</p>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setExpiry(p.value as ExpiryValue)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors',
                    expiry === p.value
                      ? 'bg-[#4a154b] border-[#4a154b] text-white'
                      : 'border-white/20 text-slate-300 hover:border-white/40 hover:text-white'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-between pt-1">
            <Button
              variant="ghost"
              onClick={handleClear}
              disabled={saving}
              className="text-slate-400 hover:text-white hover:bg-white/10 text-sm"
            >
              Clear status
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
