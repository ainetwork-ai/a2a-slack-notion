'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { WorkflowStep, FormField } from '@/lib/workflow/types';

interface WorkflowEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSaved: () => void;
  initial?: {
    id?: string;
    name?: string;
    description?: string;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    steps?: WorkflowStep[];
    enabled?: boolean;
  };
}

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'schedule', label: 'Schedule (cron)' },
  { value: 'channel_message', label: 'Channel message' },
  { value: 'channel_join', label: 'Channel join' },
  { value: 'mention', label: 'Agent mention' },
  { value: 'slash_command', label: 'Slash command (/command)' },
  { value: 'shortcut', label: 'Shortcut (⚡ button)' },
];

const STEP_TYPES = [
  { value: 'ask_agent', label: 'Ask agent' },
  { value: 'post_to_channel', label: 'Post to channel' },
  { value: 'send_message', label: 'Send message' },
  { value: 'condition', label: 'Condition (if/then)' },
  { value: 'wait', label: 'Wait' },
  { value: 'create_channel', label: 'Create channel' },
  { value: 'form', label: 'Collect form input' },
  { value: 'approval', label: 'Request approval' },
  { value: 'dm_user', label: 'Send DM to user' },
  { value: 'add_to_channel', label: 'Add user to channel' },
];

function newStep(): WorkflowStep {
  return { type: 'ask_agent', agentId: '', prompt: '', saveAs: '' } as WorkflowStep;
}

function FormFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: FormField;
  onChange: (f: FormField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-white/5 rounded p-2 space-y-1.5 bg-black/20">
      <div className="flex gap-1.5">
        <Input
          placeholder="Field name (e.g. reason)"
          value={field.name}
          onChange={e => onChange({ ...field, name: e.target.value })}
          className="bg-[#1a1d21] border-white/10 text-white text-xs flex-1"
        />
        <select
          value={field.type}
          onChange={e => onChange({ ...field, type: e.target.value as FormField['type'] })}
          className="bg-[#1a1d21] border border-white/10 rounded px-2 py-1 text-xs text-white"
        >
          <option value="text">Text</option>
          <option value="textarea">Textarea</option>
          <option value="select">Select</option>
          <option value="number">Number</option>
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 p-1">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <Input
        placeholder="Label (e.g. Vacation reason)"
        value={field.label}
        onChange={e => onChange({ ...field, label: e.target.value })}
        className="bg-[#1a1d21] border-white/10 text-white text-xs"
      />
      {field.type === 'select' && (
        <Input
          placeholder="Options (comma-separated)"
          value={(field.options ?? []).join(', ')}
          onChange={e => onChange({ ...field, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className="bg-[#1a1d21] border-white/10 text-white text-xs"
        />
      )}
      <label className="flex items-center gap-1.5 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={field.required ?? false}
          onChange={e => onChange({ ...field, required: e.target.checked })}
          className="rounded"
        />
        Required
      </label>
    </div>
  );
}

function StepEditor({
  step,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  onChange: (s: WorkflowStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const s = step as Record<string, unknown>;

  function set(field: string, value: unknown) {
    onChange({ ...step, [field]: value } as WorkflowStep);
  }

  return (
    <div className="border border-white/10 rounded-lg p-3 space-y-2 bg-white/5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-5">{index + 1}.</span>
        <select
          value={step.type}
          onChange={(e) => {
            const t = e.target.value as WorkflowStep['type'];
            if (t === 'form') {
              onChange({ type: 'form', title: '', fields: [] } as WorkflowStep);
            } else if (t === 'approval') {
              onChange({ type: 'approval', approverUserId: '', message: '' } as WorkflowStep);
            } else if (t === 'dm_user') {
              onChange({ type: 'dm_user', userId: '', message: '' } as WorkflowStep);
            } else if (t === 'add_to_channel') {
              onChange({ type: 'add_to_channel', channelId: '', userId: '' } as WorkflowStep);
            } else {
              onChange({ type: t, agentId: '', prompt: '' } as WorkflowStep);
            }
          }}
          className="flex-1 bg-[#1a1d21] border border-white/10 rounded px-2 py-1 text-sm text-white"
        >
          {STEP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button onClick={onMoveUp} disabled={isFirst} className="text-slate-400 hover:text-white disabled:opacity-30 p-1">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="text-slate-400 hover:text-white disabled:opacity-30 p-1">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 p-1">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {(step.type === 'ask_agent') && (
        <>
          <Input
            placeholder="Agent ID"
            value={(s.agentId as string) || ''}
            onChange={(e) => set('agentId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Input
            placeholder="Skill ID (optional)"
            value={(s.skillId as string) || ''}
            onChange={(e) => set('skillId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Textarea
            placeholder="Prompt (use {{varName}} for variables)"
            value={(s.prompt as string) || ''}
            onChange={(e) => set('prompt', e.target.value)}
            rows={2}
            className="bg-[#1a1d21] border-white/10 text-white text-sm resize-none"
          />
          <Input
            placeholder="Save result as (e.g. research)"
            value={(s.saveAs as string) || ''}
            onChange={(e) => set('saveAs', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
        </>
      )}

      {(step.type === 'post_to_channel' || step.type === 'send_message') && (
        <>
          <Input
            placeholder="Channel ID"
            value={(s.channelId as string) || ''}
            onChange={(e) => set('channelId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Textarea
            placeholder="Message (use {{varName}} for variables)"
            value={(s.message as string) || ''}
            onChange={(e) => set('message', e.target.value)}
            rows={2}
            className="bg-[#1a1d21] border-white/10 text-white text-sm resize-none"
          />
        </>
      )}

      {step.type === 'condition' && (
        <>
          <Input
            placeholder="Condition variable (e.g. research)"
            value={(s.if as string) || ''}
            onChange={(e) => set('if', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <p className="text-xs text-slate-400">Then/else branches can be configured via JSON steps below.</p>
        </>
      )}

      {step.type === 'wait' && (
        <Input
          type="number"
          placeholder="Duration (ms)"
          value={(s.durationMs as number) || 1000}
          onChange={(e) => set('durationMs', parseInt(e.target.value, 10))}
          className="bg-[#1a1d21] border-white/10 text-white text-sm"
        />
      )}

      {step.type === 'create_channel' && (
        <>
          <Input
            placeholder="Channel name"
            value={(s.name as string) || ''}
            onChange={(e) => set('name', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Input
            placeholder="Description (optional)"
            value={(s.description as string) || ''}
            onChange={(e) => set('description', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
        </>
      )}

      {step.type === 'form' && (
        <>
          <Input
            placeholder="Form title"
            value={(s.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Input
            placeholder="Post to channel ID (optional)"
            value={(s.submitToChannelId as string) || ''}
            onChange={(e) => set('submitToChannelId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Input
            placeholder="Save responses as (e.g. form)"
            value={(s.saveAs as string) || ''}
            onChange={(e) => set('saveAs', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <div className="space-y-1.5">
            <p className="text-xs text-slate-400">Fields (access via {'{{form.fieldname}}'})</p>
            {((s.fields as FormField[]) || []).map((field, fi) => (
              <FormFieldEditor
                key={fi}
                field={field}
                onChange={(f) => {
                  const fields = [...((s.fields as FormField[]) || [])];
                  fields[fi] = f;
                  set('fields', fields);
                }}
                onRemove={() => {
                  const fields = ((s.fields as FormField[]) || []).filter((_, idx) => idx !== fi);
                  set('fields', fields);
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                const fields = [...((s.fields as FormField[]) || []), { name: '', label: '', type: 'text' as const }];
                set('fields', fields);
              }}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add field
            </button>
          </div>
        </>
      )}

      {step.type === 'approval' && (
        <>
          <Input
            placeholder="Approver user ID"
            value={(s.approverUserId as string) || ''}
            onChange={(e) => set('approverUserId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Textarea
            placeholder="Approval request message (use {{varName}} for variables)"
            value={(s.message as string) || ''}
            onChange={(e) => set('message', e.target.value)}
            rows={2}
            className="bg-[#1a1d21] border-white/10 text-white text-sm resize-none"
          />
          <Input
            placeholder="Save decision as (e.g. approval)"
            value={(s.saveAs as string) || ''}
            onChange={(e) => set('saveAs', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <p className="text-xs text-slate-400">Decision stored as &quot;approve&quot; or &quot;reject&quot; in the variable.</p>
        </>
      )}

      {step.type === 'dm_user' && (
        <>
          <Input
            placeholder="User ID to DM"
            value={(s.userId as string) || ''}
            onChange={(e) => set('userId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Textarea
            placeholder="Message (use {{varName}} for variables)"
            value={(s.message as string) || ''}
            onChange={(e) => set('message', e.target.value)}
            rows={2}
            className="bg-[#1a1d21] border-white/10 text-white text-sm resize-none"
          />
        </>
      )}

      {step.type === 'add_to_channel' && (
        <>
          <Input
            placeholder="Channel ID"
            value={(s.channelId as string) || ''}
            onChange={(e) => set('channelId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
          <Input
            placeholder="User ID to add"
            value={(s.userId as string) || ''}
            onChange={(e) => set('userId', e.target.value)}
            className="bg-[#1a1d21] border-white/10 text-white text-sm"
          />
        </>
      )}
    </div>
  );
}

export default function WorkflowEditorModal({
  open,
  onOpenChange,
  workspaceId,
  onSaved,
  initial,
}: WorkflowEditorModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [triggerType, setTriggerType] = useState(initial?.triggerType ?? 'manual');
  const [triggerConfig, setTriggerConfig] = useState(
    initial?.triggerConfig ? JSON.stringify(initial.triggerConfig, null, 2) : '{}'
  );
  const [steps, setSteps] = useState<WorkflowStep[]>(initial?.steps ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shortcut label helper
  const [shortcutLabel, setShortcutLabel] = useState(
    (initial?.triggerConfig?.label as string) ?? ''
  );
  const [slashCommand, setSlashCommand] = useState(
    (initial?.triggerConfig?.command as string) ?? ''
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setIsLoading(true);
    setError(null);

    let parsedConfig: Record<string, unknown> = {};

    // Build triggerConfig based on trigger type
    if (triggerType === 'slash_command') {
      parsedConfig = { command: slashCommand.replace(/^\//, '').toLowerCase() };
    } else if (triggerType === 'shortcut') {
      parsedConfig = { label: shortcutLabel };
    } else if (triggerType !== 'manual') {
      try {
        parsedConfig = JSON.parse(triggerConfig);
      } catch {
        setError('Trigger config is not valid JSON');
        setIsLoading(false);
        return;
      }
    }

    try {
      const url = initial?.id ? `/api/workflows/${initial.id}` : '/api/workflows';
      const method = initial?.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          triggerType,
          triggerConfig: parsedConfig,
          steps,
          workspaceId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save workflow');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  }

  function addStep() {
    setSteps((prev) => [...prev, newStep()]);
  }

  function updateStep(i: number, s: WorkflowStep) {
    setSteps((prev) => prev.map((x, idx) => (idx === i ? s : x)));
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveStep(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {initial?.id ? 'Edit Workflow' : 'New Workflow'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My workflow"
              className="bg-[#222529] border-white/10 text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              className="bg-[#222529] border-white/10 text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full bg-[#222529] border border-white/10 rounded px-3 py-2 text-sm text-white"
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {triggerType === 'slash_command' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Command name (without /)</label>
              <Input
                value={slashCommand}
                onChange={(e) => setSlashCommand(e.target.value.replace(/^\//, '').toLowerCase())}
                placeholder="time-off"
                className="bg-[#222529] border-white/10 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Users type /{slashCommand || 'command'} in any channel to trigger this workflow.</p>
            </div>
          )}

          {triggerType === 'shortcut' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Shortcut label</label>
              <Input
                value={shortcutLabel}
                onChange={(e) => setShortcutLabel(e.target.value)}
                placeholder="Time off request"
                className="bg-[#222529] border-white/10 text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Appears in the ⚡ shortcut menu in channel message input.</p>
            </div>
          )}

          {triggerType !== 'manual' && triggerType !== 'slash_command' && triggerType !== 'shortcut' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Trigger config (JSON)</label>
              <Textarea
                value={triggerConfig}
                onChange={(e) => setTriggerConfig(e.target.value)}
                rows={3}
                className="bg-[#222529] border-white/10 text-white text-xs font-mono resize-none"
                placeholder='{"channelId": "...", "pattern": ".*"}'
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Steps</label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addStep}
                className="text-xs text-slate-300 hover:text-white h-7 px-2"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add step
              </Button>
            </div>
            <div className="space-y-2">
              {steps.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-white/10 rounded-lg">
                  No steps yet. Add a step to get started.
                </p>
              )}
              {steps.map((step, i) => (
                <StepEditor
                  key={i}
                  step={step}
                  index={i}
                  onChange={(s) => updateStep(i, s)}
                  onRemove={() => removeStep(i)}
                  onMoveUp={() => moveStep(i, -1)}
                  onMoveDown={() => moveStep(i, 1)}
                  isFirst={i === 0}
                  isLast={i === steps.length - 1}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {initial?.id ? 'Save changes' : 'Create workflow'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
