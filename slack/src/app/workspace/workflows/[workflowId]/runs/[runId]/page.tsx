'use client';

import { use, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Save } from 'lucide-react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { renderInlineMarkdown } from '@/components/chat/MessageItem';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface WorkflowStep {
  type: string;
  saveAs?: string;
  agent?: string;
  skillId?: string;
  channel?: string;
  channelId?: string;
  agentId?: string;
  title?: string;
  [k: string]: unknown;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string | null;
  currentStepIndex?: number | null;
  variables: Record<string, unknown>;
  error?: string | null;
}

interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

function statusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-[#36c5f0]" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'paused':
      return <Pause className="w-4 h-4 text-amber-400" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
}

function stepTitle(step: WorkflowStep): string {
  switch (step.type) {
    case 'invoke_skill':
      return `${step.agent || '?'}.${step.skillId || '?'}`;
    case 'ask_agent':
      return `Ask ${step.agent || '?'}`;
    case 'send_message':
    case 'post_to_channel':
      return `Post to ${step.channel || '?'}`;
    case 'write_canvas':
      return `Canvas: ${step.channel || '?'}${step.title ? ` — ${step.title}` : ''}`;
    case 'condition':
      return `If ${step.if || '?'}`;
    case 'wait':
      return `Wait ${step.durationMs || 0}ms`;
    default:
      return step.type;
  }
}

export default function WorkflowRunPage({
  params,
}: {
  params: Promise<{ workflowId: string; runId: string }>;
}) {
  const { workflowId, runId } = use(params);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data, mutate } = useSWR<{ run: WorkflowRun; workflow: Workflow }>(
    `/api/workflows/${workflowId}/runs/${runId}`,
    fetcher,
    { refreshInterval: 2000 }
  );

  if (!data?.run || !data?.workflow) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const { run, workflow } = data;
  const steps = workflow.steps || [];
  const currentIdx = run.currentStepIndex ?? 0;

  // Selected step (default: current or last completed)
  const activeIdx =
    selectedStepIdx ??
    (run.status === 'running' || run.status === 'paused' ? currentIdx : steps.length - 1);
  const activeStep = steps[activeIdx];
  const activeSaveAs = activeStep?.saveAs;
  const activeOutput = activeSaveAs ? run.variables?.[activeSaveAs] : undefined;

  async function saveToChannelCanvas(channel: string, content: string) {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: 'slack',
          toolName: 'canvas_write',
          params: { channelId: channel, content },
        }),
      });
      if (res.ok) setSaveMsg('Saved to canvas ✓');
      else setSaveMsg('Save failed');
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Step timeline */}
      <div className="w-80 border-r border-white/5 bg-[#1a1d21] overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 mb-1">
            {statusIcon(run.status)}
            <h2 className="font-semibold text-white text-sm truncate">
              {workflow.name}
            </h2>
          </div>
          <p className="text-[11px] text-slate-500">
            {new Date(run.startedAt).toLocaleString()}
            {run.completedAt &&
              ` · ${Math.round(
                (new Date(run.completedAt).getTime() -
                  new Date(run.startedAt).getTime()) /
                  1000
              )}s`}
          </p>
          {run.error && (
            <p className="text-xs text-red-400 mt-1">{run.error}</p>
          )}
        </div>

        <div className="py-2">
          {steps.map((step, i) => {
            const isActive = i === activeIdx;
            const isCurrent = i === currentIdx && run.status !== 'completed';
            const isCompleted = run.status === 'completed' || i < currentIdx;
            const isFailed = run.status === 'failed' && i === currentIdx;
            return (
              <button
                key={i}
                onClick={() => setSelectedStepIdx(i)}
                className={cn(
                  'w-full flex items-start gap-2 px-4 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-[#4a154b]/30 border-l-2 border-[#4a154b]'
                    : 'hover:bg-white/5 border-l-2 border-transparent'
                )}
              >
                <span className="text-[11px] text-slate-500 shrink-0 mt-0.5 w-5">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {stepTitle(step)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {step.type}
                    {step.saveAs && ` → {{${step.saveAs}}}`}
                  </p>
                </div>
                <span className="shrink-0 mt-0.5">
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : isFailed ? (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#36c5f0]" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-600" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Variables summary */}
        {run.variables && Object.keys(run.variables).length > 0 && (
          <div className="px-4 py-3 border-t border-white/5 mt-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">
              Variables
            </p>
            {Object.entries(run.variables).map(([k, v]) => (
              <div key={k} className="mb-1">
                <code className="text-[11px] text-[#36c5f0]">{`{{${k}}}`}</code>
                <span className="text-[11px] text-slate-500 ml-2">
                  {String(v).slice(0, 40)}
                  {String(v).length > 40 ? '…' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Canvas viewer */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              Step {activeIdx + 1}
            </span>
            <span className="text-xs text-slate-400">
              {activeStep ? stepTitle(activeStep) : ''}
            </span>
          </div>
          {Boolean(activeOutput) && Boolean(activeStep?.channel) && (
            <Button
              size="sm"
              onClick={() => saveToChannelCanvas(activeStep.channel as string, String(activeOutput))}
              disabled={saving}
              className="bg-[#007a5a] hover:bg-[#148567] text-white text-xs h-7 gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save to Canvas
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {saveMsg && (
            <div className="mb-3 text-xs text-center text-green-400 bg-green-500/10 border border-green-500/20 rounded px-3 py-1.5">
              {saveMsg}
            </div>
          )}

          {activeOutput ? (
            <article className="prose prose-invert max-w-3xl mx-auto">
              <div
                className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: renderInlineMarkdown(String(activeOutput)),
                }}
              />
            </article>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">
                {activeStep?.saveAs
                  ? 'Step has not produced output yet'
                  : 'This step does not save output'}
              </p>
              {activeStep?.saveAs && run.status === 'running' && (
                <p className="text-xs text-slate-600 mt-2">
                  Auto-refreshing every 2s...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
