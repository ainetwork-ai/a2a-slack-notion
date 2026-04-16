'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Play, Trash2, Pencil, CheckCircle, XCircle, Clock, ToggleLeft, ToggleRight, Loader2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WorkflowBuilder from '@/components/workflow/WorkflowBuilder';
import WorkflowTemplates from '@/components/modals/WorkflowTemplates';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { cn } from '@/lib/utils';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: unknown[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  channel_message: 'Channel message',
  channel_join: 'Channel join',
  mention: 'Agent mention',
  slash_command: 'Slash command',
  shortcut: 'Shortcut',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    completed: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400' },
    failed: { icon: <XCircle className="w-3 h-3" />, color: 'text-red-400' },
    running: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-400' },
    pending: { icon: <Clock className="w-3 h-3" />, color: 'text-slate-400' },
  };
  const { icon, color } = map[status] ?? { icon: null, color: 'text-slate-400' };
  return (
    <span className={cn('flex items-center gap-1 text-xs', color)}>
      {icon}
      {status}
    </span>
  );
}

export default function WorkflowsPage() {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Record<string, WorkflowRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workflows?workspaceId=${activeWorkspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
      }
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  async function fetchRuns(workflowId: string) {
    const res = await fetch(`/api/workflows/${workflowId}/runs`);
    if (res.ok) {
      const data = await res.json();
      setRuns((prev) => ({ ...prev, [workflowId]: data }));
    }
  }

  async function handleToggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      await fetchRuns(id);
    }
  }

  async function handleRun(id: string) {
    setRunningId(id);
    try {
      const res = await fetch(`/api/workflows/${id}/run`, { method: 'POST' });
      if (res.ok) {
        setTimeout(() => fetchRuns(id), 500);
        if (expandedId !== id) setExpandedId(id);
      }
    } finally {
      setRunningId(null);
    }
  }

  async function handleToggleEnabled(workflow: Workflow) {
    await fetch(`/api/workflows/${workflow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !workflow.enabled }),
    });
    fetchWorkflows();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }

  function handleEdit(workflow: Workflow) {
    setEditingWorkflow(workflow);
    setEditorOpen(true);
  }

  function handleNewWorkflow() {
    setEditingWorkflow(null);
    setEditorOpen(true);
  }

  if (!activeWorkspaceId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Select a workspace to view workflows.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden main-content">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-12 border-b shrink-0 channel-header">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="font-semibold text-white text-sm">Workflow Builder</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTemplatesOpen(true)}
            className="text-slate-400 hover:text-white h-7 text-xs px-3"
          >
            <LayoutTemplate className="w-3 h-3 mr-1" />
            Templates
          </Button>
          <Button
            size="sm"
            onClick={handleNewWorkflow}
            className="bg-[#4a154b] hover:bg-[#611f6a] text-white h-7 text-xs px-3"
          >
            <Plus className="w-3 h-3 mr-1" />
            New workflow
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
            <Zap className="w-10 h-10 text-slate-600" />
            <p className="text-sm">No workflows yet.</p>
            <Button
              size="sm"
              onClick={handleNewWorkflow}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              <Plus className="w-3 h-3 mr-1" />
              Create your first workflow
            </Button>
          </div>
        ) : (
          workflows.map((wf) => (
            <div
              key={wf.id}
              className="border border-white/10 rounded-lg bg-[#222529] overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Enable toggle */}
                <button
                  onClick={() => handleToggleEnabled(wf)}
                  className={cn(
                    'shrink-0 transition-colors',
                    wf.enabled ? 'text-green-400 hover:text-green-300' : 'text-slate-500 hover:text-slate-400'
                  )}
                  title={wf.enabled ? 'Disable workflow' : 'Enable workflow'}
                >
                  {wf.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm truncate">{wf.name}</span>
                    <span className="text-xs text-slate-400 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                      {TRIGGER_LABELS[wf.triggerType] ?? wf.triggerType}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {wf.description && (
                    <p className="text-xs text-slate-400 truncate mt-0.5">{wf.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleExpand(wf.id)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5"
                  >
                    Runs
                  </button>
                  <button
                    onClick={() => handleEdit(wf)}
                    className="text-slate-400 hover:text-white p-1.5 rounded hover:bg-white/5"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {wf.triggerType === 'manual' && (
                    <button
                      onClick={() => handleRun(wf.id)}
                      disabled={runningId === wf.id}
                      className="text-green-400 hover:text-green-300 p-1.5 rounded hover:bg-white/5 disabled:opacity-50"
                      title="Run now"
                    >
                      {runningId === wf.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(wf.id)}
                    className="text-red-400 hover:text-red-300 p-1.5 rounded hover:bg-white/5"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Runs panel */}
              {expandedId === wf.id && (
                <div className="border-t border-white/10 px-4 py-3 bg-black/20">
                  <p className="text-xs text-slate-400 mb-2">Recent runs</p>
                  {!runs[wf.id] ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  ) : runs[wf.id].length === 0 ? (
                    <p className="text-xs text-slate-500">No runs yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {runs[wf.id].map((run) => (
                        <div key={run.id} className="flex items-center gap-3 text-xs">
                          <StatusBadge status={run.status} />
                          <span className="text-slate-400">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                          {run.error && (
                            <span className="text-red-400 truncate">{run.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <WorkflowTemplates
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        workspaceId={activeWorkspaceId}
        onCreated={fetchWorkflows}
      />

      {editorOpen && (
        <WorkflowBuilder
          workspaceId={activeWorkspaceId}
          onClose={() => { setEditorOpen(false); setEditingWorkflow(null); }}
          onSaved={fetchWorkflows}
          initial={
            editingWorkflow
              ? {
                  id: editingWorkflow.id,
                  name: editingWorkflow.name,
                  description: editingWorkflow.description ?? undefined,
                  triggerType: editingWorkflow.triggerType,
                  triggerConfig: editingWorkflow.triggerConfig,
                  steps: editingWorkflow.steps as import('@/lib/workflow/types').WorkflowStep[],
                  enabled: editingWorkflow.enabled,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
