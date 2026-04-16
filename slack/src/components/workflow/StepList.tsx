'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkflowStep } from '@/lib/workflow/types';
import StepTypePicker from './StepTypePicker';
import StepEditor from './StepEditor';

function stepIcon(type: WorkflowStep['type']): string {
  const map: Record<WorkflowStep['type'], string> = {
    send_message: '💬',
    post_to_channel: '↩️',
    invoke_skill: '⚡',
    ask_agent: '🤖',
    condition: '🔀',
    wait: '⏱️',
    create_channel: '📝',
    form: '📥',
    approval: '✅',
    dm_user: '👤',
    add_to_channel: '➕',
    write_canvas: '📄',
  };
  return map[type] ?? '⚙️';
}

function stepLabel(type: WorkflowStep['type']): string {
  const map: Record<WorkflowStep['type'], string> = {
    send_message: 'Send a message',
    post_to_channel: 'Post to channel',
    invoke_skill: 'Invoke agent skill',
    ask_agent: 'Ask an agent (legacy)',
    condition: 'If/else condition',
    wait: 'Wait for time',
    create_channel: 'Create channel',
    form: 'Collect form input',
    approval: 'Request approval',
    dm_user: 'Send a DM',
    add_to_channel: 'Add user to channel',
    write_canvas: 'Write to canvas',
  };
  return map[type] ?? type;
}

function stepPreview(step: WorkflowStep): string {
  const s = step as Record<string, unknown>;
  switch (step.type) {
    case 'send_message':
    case 'post_to_channel': {
      const ch = (s.channelId as string) || '?';
      const msg = (s.message as string) || '';
      return `in #${ch}${msg ? `: "${msg.slice(0, 40)}${msg.length > 40 ? '…' : ''}"` : ''}`;
    }
    case 'invoke_skill': {
      const agent = (s.agent as string) || '?';
      const skill = (s.skillId as string) || '?';
      return `${agent}.${skill}`;
    }
    case 'write_canvas': {
      const ch = (s.channel as string) || '?';
      const title = (s.title as string) || '';
      return `#${ch}${title ? ` — "${title}"` : ''}${s.append ? ' (append)' : ''}`;
    }
    case 'ask_agent': {
      const agent = (s.agentId as string) || '?';
      const prompt = (s.prompt as string) || '';
      return `${agent}${prompt ? `: "${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}"` : ''}`;
    }
    case 'dm_user': {
      const user = (s.userId as string) || '?';
      return `to ${user}`;
    }
    case 'add_to_channel':
      return `${(s.userId as string) || '?'} → #${(s.channelId as string) || '?'}`;
    case 'approval':
      return `Approver: ${(s.approverUserId as string) || '?'}`;
    case 'wait':
      return `${(s.durationMs as number) ?? 1000}ms`;
    case 'create_channel':
      return `#${(s.name as string) || '?'}`;
    case 'form':
      return `"${(s.title as string) || 'Untitled form'}"`;
    case 'condition':
      return `if {{${(s.if as string) || '?'}}}`;
    default:
      return '';
  }
}

function defaultStep(type: WorkflowStep['type']): WorkflowStep {
  switch (type) {
    case 'invoke_skill': return { type, agent: '', skillId: '', inputs: {}, saveAs: '' };
    case 'write_canvas': return { type, channel: '', content: '', append: false, saveAs: '' };
    case 'ask_agent': return { type, agentId: '', prompt: '', saveAs: '' };
    case 'send_message': return { type, channelId: '', message: '' };
    case 'post_to_channel': return { type, channelId: '', message: '' };
    case 'dm_user': return { type, userId: '', message: '' };
    case 'add_to_channel': return { type, channelId: '', userId: '' };
    case 'approval': return { type, approverUserId: '', message: '', saveAs: '' };
    case 'condition': return { type, if: '', then: [] };
    case 'wait': return { type, durationMs: 1000 };
    case 'create_channel': return { type, name: '' };
    case 'form': return { type, title: '', fields: [] };
    default: return { type: 'send_message', channelId: '', message: '' };
  }
}

interface StepListProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function StepList({ steps, onChange, onContinue, onBack }: StepListProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function addStep(type: WorkflowStep['type']) {
    const newSteps = [...steps, defaultStep(type)];
    onChange(newSteps);
    setShowPicker(false);
    setEditingIndex(newSteps.length - 1);
  }

  function updateStep(i: number, s: WorkflowStep) {
    onChange(steps.map((x, idx) => (idx === i ? s : x)));
  }

  function removeStep(i: number) {
    onChange(steps.filter((_, idx) => idx !== i));
    if (editingIndex === i) setEditingIndex(null);
  }

  function moveStep(i: number, dir: -1 | 1) {
    const arr = [...steps];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Then do...</h2>
          <p className="text-sm text-slate-400 mt-1">Add the steps this workflow will perform</p>
        </div>

        <div className="space-y-2">
          {steps.length === 0 && (
            <div className="border border-dashed border-white/10 rounded-xl py-10 text-center text-slate-500 text-sm">
              No steps yet — add one below
            </div>
          )}

          {steps.map((step, i) => (
            <div key={i}>
              <div
                className={`border rounded-xl overflow-hidden transition-colors ${
                  editingIndex === i
                    ? 'border-[#4a154b]/60 bg-[#1a1d21]'
                    : 'border-white/10 bg-white/3 hover:bg-white/5'
                }`}
              >
                {/* Step header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl w-7 text-center">{stepIcon(step.type)}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium">{stepLabel(step.type)}</span>
                    {stepPreview(step) && (
                      <span className="text-slate-400 text-sm ml-2">{stepPreview(step)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                      className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveStep(i, -1)}
                      disabled={i === 0}
                      className="text-slate-500 hover:text-white disabled:opacity-20 p-1.5 rounded hover:bg-white/10 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveStep(i, 1)}
                      disabled={i === steps.length - 1}
                      className="text-slate-500 hover:text-white disabled:opacity-20 p-1.5 rounded hover:bg-white/10 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeStep(i)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline editor */}
                {editingIndex === i && (
                  <div className="border-t border-white/10 px-4 py-4 bg-black/20">
                    <StepEditor
                      step={step}
                      onChange={(s) => updateStep(i, s)}
                      onDone={() => setEditingIndex(null)}
                    />
                  </div>
                )}
              </div>

              {/* Connector line between steps */}
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-white/10" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add step button */}
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/20 rounded-xl text-slate-400 hover:text-white hover:border-white/40 hover:bg-white/3 transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Add step
        </button>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack} className="text-slate-400 hover:text-white">
            Back
          </Button>
          <Button
            onClick={onContinue}
            disabled={steps.length === 0}
            className="bg-[#4a154b] hover:bg-[#611f6a] text-white disabled:opacity-50"
          >
            Review & publish
          </Button>
        </div>
      </div>

      {showPicker && (
        <StepTypePicker
          onSelect={addStep}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
