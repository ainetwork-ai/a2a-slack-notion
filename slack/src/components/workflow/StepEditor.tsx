'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { WorkflowStep, FormField } from '@/lib/workflow/types';
import EntityPicker from './EntityPicker';

interface StepEditorProps {
  step: WorkflowStep;
  onChange: (step: WorkflowStep) => void;
  onDone: () => void;
}

function inputCls() {
  return 'bg-[#0f1114] border-white/10 text-white text-sm';
}

function FormFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: FormField;
  onChange: (f: FormField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-start border border-white/5 rounded-lg p-3 bg-black/20 space-y-0">
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Field name (e.g. reason)"
            value={field.name}
            onChange={(e) => onChange({ ...field, name: e.target.value })}
            className={inputCls()}
          />
          <select
            value={field.type}
            onChange={(e) => onChange({ ...field, type: e.target.value as FormField['type'] })}
            className="bg-[#0f1114] border border-white/10 rounded px-2 py-1.5 text-xs text-white"
          >
            <option value="text">Text</option>
            <option value="textarea">Textarea</option>
            <option value="select">Select</option>
            <option value="number">Number</option>
          </select>
        </div>
        <Input
          placeholder="Label (e.g. Vacation reason)"
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          className={inputCls()}
        />
        {field.type === 'select' && (
          <Input
            placeholder="Options (comma-separated)"
            value={(field.options ?? []).join(', ')}
            onChange={(e) =>
              onChange({ ...field, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
            }
            className={inputCls()}
          />
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
          />
          Required
        </label>
      </div>
      <button onClick={onRemove} className="text-slate-500 hover:text-red-400 p-1 mt-0.5">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function StepEditor({ step, onChange, onDone }: StepEditorProps) {
  const s = step as Record<string, unknown>;

  function set(field: string, value: unknown) {
    onChange({ ...step, [field]: value } as WorkflowStep);
  }

  const [showVarHint] = useState(true);

  const varHint = showVarHint ? (
    <p className="text-xs text-slate-500 mt-1">Use {'{{varName}}'} to insert variables from previous steps.</p>
  ) : null;

  return (
    <div className="space-y-4">
      {step.type === 'ask_agent' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Agent</label>
            <EntityPicker
              kind="agent"
              value={(s.agentId as string) || ''}
              onChange={(v) => {
                // Changing the agent invalidates the previously selected skill.
                onChange({ ...step, agentId: v, skillId: undefined } as WorkflowStep);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Skill (optional)</label>
            <EntityPicker
              kind="skill"
              agentId={(s.agentId as string) || ''}
              value={(s.skillId as string) || ''}
              onChange={(v) => set('skillId', v || undefined)}
              clearable
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Prompt</label>
            <Textarea
              placeholder="What should the agent do? Use {{trigger.message}} for trigger data."
              value={(s.prompt as string) || ''}
              onChange={(e) => set('prompt', e.target.value)}
              rows={3}
              className={`${inputCls()} resize-none`}
            />
            {varHint}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Save result as</label>
            <Input
              placeholder="e.g. research (access later as {{research}})"
              value={(s.saveAs as string) || ''}
              onChange={(e) => set('saveAs', e.target.value)}
              className={inputCls()}
            />
          </div>
        </>
      )}

      {(step.type === 'send_message' || step.type === 'post_to_channel') && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Channel</label>
            <EntityPicker
              kind="channel"
              value={(s.channelId as string) || ''}
              onChange={(v) => set('channelId', v)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Message</label>
            <Textarea
              placeholder="Hello! {{research}}"
              value={(s.message as string) || ''}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              className={`${inputCls()} resize-none`}
            />
            {varHint}
          </div>
        </>
      )}

      {step.type === 'dm_user' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">User</label>
            <EntityPicker
              kind="user"
              value={(s.userId as string) || ''}
              onChange={(v) => set('userId', v)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Message</label>
            <Textarea
              placeholder="Hi {{user.name}}, ..."
              value={(s.message as string) || ''}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              className={`${inputCls()} resize-none`}
            />
            {varHint}
          </div>
        </>
      )}

      {step.type === 'add_to_channel' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Channel</label>
            <EntityPicker
              kind="channel"
              value={(s.channelId as string) || ''}
              onChange={(v) => set('channelId', v)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">User</label>
            <EntityPicker
              kind="user"
              value={(s.userId as string) || ''}
              onChange={(v) => set('userId', v)}
            />
          </div>
        </>
      )}

      {step.type === 'approval' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Approver</label>
            <EntityPicker
              kind="user"
              value={(s.approverUserId as string) || ''}
              onChange={(v) => set('approverUserId', v)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Request message</label>
            <Textarea
              placeholder="Please approve: {{form.reason}}"
              value={(s.message as string) || ''}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              className={`${inputCls()} resize-none`}
            />
            {varHint}
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Save decision as</label>
            <Input
              placeholder="e.g. approval (stored as 'approve' or 'reject')"
              value={(s.saveAs as string) || ''}
              onChange={(e) => set('saveAs', e.target.value)}
              className={inputCls()}
            />
          </div>
        </>
      )}

      {step.type === 'condition' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Condition variable</label>
            <Input
              placeholder="e.g. approval"
              value={(s.if as string) || ''}
              onChange={(e) => set('if', e.target.value)}
              className={inputCls()}
            />
          </div>
          <p className="text-xs text-slate-500">Then/else branch steps can be configured in the JSON editor after saving.</p>
        </>
      )}

      {step.type === 'wait' && (
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Duration (milliseconds)</label>
          <Input
            type="number"
            placeholder="5000"
            value={(s.durationMs as number) || 1000}
            onChange={(e) => set('durationMs', parseInt(e.target.value, 10))}
            className={inputCls()}
          />
          <p className="text-xs text-slate-500 mt-1">1000ms = 1 second</p>
        </div>
      )}

      {step.type === 'create_channel' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Channel name</label>
            <Input
              placeholder="new-channel"
              value={(s.name as string) || ''}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls()}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description (optional)</label>
            <Input
              placeholder="What is this channel for?"
              value={(s.description as string) || ''}
              onChange={(e) => set('description', e.target.value)}
              className={inputCls()}
            />
          </div>
        </>
      )}

      {step.type === 'form' && (
        <>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Form title</label>
            <Input
              placeholder="e.g. Time off request"
              value={(s.title as string) || ''}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls()}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Post to channel (optional)</label>
            <EntityPicker
              kind="channel"
              value={(s.submitToChannelId as string) || ''}
              onChange={(v) => set('submitToChannelId', v || undefined)}
              clearable
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Save as</label>
            <Input
              placeholder="e.g. form (access via {{form.fieldname}})"
              value={(s.saveAs as string) || ''}
              onChange={(e) => set('saveAs', e.target.value)}
              className={inputCls()}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Fields</label>
            <div className="space-y-2">
              {((s.fields as FormField[]) || []).map((field, fi) => (
                <FormFieldRow
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
            </div>
            <button
              type="button"
              onClick={() => {
                const fields = [
                  ...((s.fields as FormField[]) || []),
                  { name: '', label: '', type: 'text' as const },
                ];
                set('fields', fields);
              }}
              className="mt-2 text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add field
            </button>
          </div>
        </>
      )}

      <div className="pt-2">
        <Button
          onClick={onDone}
          className="bg-[#4a154b] hover:bg-[#611f6a] text-white w-full"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
