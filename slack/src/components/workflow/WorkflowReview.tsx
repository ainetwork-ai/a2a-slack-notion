'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow/types';
import type { TriggerConfigData } from './TriggerConfig';
import type { TriggerType } from './TriggerPicker';

function triggerSummary(triggerType: TriggerType, config: TriggerConfigData): string {
  switch (triggerType) {
    case 'shortcut':
      return `a shortcut named "${config.shortcutName || 'Unnamed'}" is triggered`;
    case 'schedule': {
      const freq = config.scheduleFrequency || 'every day';
      const time = config.scheduleTime || '09:00';
      const [h, m] = time.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour < 12 ? 'AM' : 'PM';
      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${freq} at ${h12}:${m} ${ampm}`;
    }
    case 'channel_message': {
      const ch = config.channelId || 'a channel';
      if (config.keywordEnabled && config.keyword) {
        return `a message containing "${config.keyword}" is posted in #${ch}`;
      }
      return `a message is posted in #${ch}`;
    }
    case 'channel_join':
      return `someone joins #${config.joinChannelId || 'a channel'}`;
    case 'webhook':
      return 'a webhook call is received';
    case 'form':
      return 'a form is submitted';
    default:
      return 'the trigger fires';
  }
}

function stepIcon(step: WorkflowStep): string {
  const t = (step as { type: string }).type;
  if (t === 'send_message' || t === 'post_to_channel') return '💬';
  if (t === 'ask_agent') return '🤖';
  if (t === 'dm_user') return '👤';
  if (t === 'approval') return '✅';
  if (t === 'form') return '📥';
  if (t === 'condition') return '🔀';
  if (t === 'wait') return '⏱️';
  if (t === 'add_to_channel') return '➕';
  if (t === 'create_channel') return '📝';
  return '⚙️';
}

function stepSummary(step: WorkflowStep, index: number): string {
  const s = step as Record<string, unknown>;
  const n = index + 1;
  switch (step.type) {
    case 'send_message':
    case 'post_to_channel': {
      const ch = (s.channelId as string) || '?';
      const msg = (s.message as string) || '';
      return `${n}. Send a message in #${ch}${msg ? `: "${msg.slice(0, 60)}${msg.length > 60 ? '…' : ''}"` : ''}`;
    }
    case 'ask_agent': {
      const agent = (s.agentId as string) || '?';
      const prompt = (s.prompt as string) || '';
      return `${n}. Ask ${agent}: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`;
    }
    case 'dm_user':
      return `${n}. Send a DM to ${(s.userId as string) || '?'}`;
    case 'add_to_channel':
      return `${n}. Add ${(s.userId as string) || '?'} to #${(s.channelId as string) || '?'}`;
    case 'approval':
      return `${n}. Request approval from ${(s.approverUserId as string) || '?'}`;
    case 'wait':
      return `${n}. Wait ${(s.durationMs as number) ?? 1000}ms`;
    case 'create_channel':
      return `${n}. Create channel #${(s.name as string) || '?'}`;
    case 'form':
      return `${n}. Show form: "${(s.title as string) || 'Untitled'}"`;
    case 'condition':
      return `${n}. If {{${(s.if as string) || '?'}}} then branch`;
    default:
      return `${n}. ${(step as { type: string }).type}`;
  }
}

interface WorkflowReviewProps {
  name: string;
  onNameChange: (name: string) => void;
  triggerType: TriggerType;
  triggerConfig: TriggerConfigData;
  steps: WorkflowStep[];
  onPublish: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onBack: () => void;
  error: string | null;
}

export default function WorkflowReview({
  name,
  onNameChange,
  triggerType,
  triggerConfig,
  steps,
  onPublish,
  onSaveDraft,
  onBack,
  error,
}: WorkflowReviewProps) {
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      await onSaveDraft();
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Review & publish</h2>
        <p className="text-sm text-slate-400 mt-1">Give your workflow a name and publish it</p>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Workflow name</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Onboarding welcome message"
          className="bg-[#0f1114] border-white/10 text-white text-base"
        />
      </div>

      {/* Summary card */}
      <div className="bg-white/3 border border-white/10 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">When</p>
          <p className="text-white text-base leading-relaxed">
            {triggerSummary(triggerType, triggerConfig)}
          </p>
        </div>

        {steps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Then</p>
            <ul className="space-y-2">
              {steps.map((step, i) => (
                <li key={i} className="text-white text-base leading-relaxed flex items-start gap-2">
                  <span className="text-slate-400 shrink-0 mt-0.5">
                    {stepIcon(step)}
                  </span>
                  <span>{stepSummary(step, i)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {steps.length === 0 && (
          <p className="text-slate-500 text-sm italic">No steps configured yet</p>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-400 hover:text-white">
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleSaveDraft}
            disabled={savingDraft || publishing || !name.trim()}
            className="text-slate-300 hover:text-white border border-white/10 hover:border-white/20"
          >
            {savingDraft ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save as draft
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishing || savingDraft || !name.trim() || steps.length === 0}
            className="bg-[#4a154b] hover:bg-[#611f6a] text-white disabled:opacity-50 gap-2"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
