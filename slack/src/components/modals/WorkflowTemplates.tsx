'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { WorkflowStep } from '@/lib/workflow/types';

interface WorkflowTemplate {
  name: string;
  description: string;
  icon: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  steps: WorkflowStep[];
}

const TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'New member onboarding',
    description: 'When someone joins a channel, send them a welcome DM and add them to key channels.',
    icon: '👋',
    triggerType: 'channel_join',
    triggerConfig: { channelId: '' },
    steps: [
      {
        type: 'dm_user',
        userId: '{{triggeredBy}}',
        message: 'Welcome to the team! Here are some tips to get started:\n\n• Check out #general for announcements\n• Use /help for available commands\n\nLet us know if you need anything!',
      },
      {
        type: 'add_to_channel',
        channelId: '',
        userId: '{{triggeredBy}}',
      },
    ],
  },
  {
    name: 'Time off request',
    description: 'Employee fills out a form with dates and reason, then a manager approves or rejects.',
    icon: '🏖️',
    triggerType: 'shortcut',
    triggerConfig: { label: 'Time off request' },
    steps: [
      {
        type: 'form',
        title: 'Time Off Request',
        fields: [
          { name: 'start_date', label: 'Start date', type: 'text', required: true },
          { name: 'end_date', label: 'End date', type: 'text', required: true },
          { name: 'reason', label: 'Reason', type: 'textarea', required: false },
          {
            name: 'type',
            label: 'Leave type',
            type: 'select',
            options: ['Vacation', 'Sick leave', 'Personal', 'Other'],
            required: true,
          },
        ],
        saveAs: 'form',
      },
      {
        type: 'approval',
        approverUserId: '',
        message: 'Time off request from {{triggeredBy}}:\n\n• Dates: {{form.start_date}} to {{form.end_date}}\n• Type: {{form.type}}\n• Reason: {{form.reason}}',
        saveAs: 'approval',
      },
      {
        type: 'condition',
        if: 'approval',
        then: [
          {
            type: 'dm_user',
            userId: '{{triggeredBy}}',
            message: 'Your time off request has been **approved**! Enjoy your time off.',
          },
        ],
        else: [
          {
            type: 'dm_user',
            userId: '{{triggeredBy}}',
            message: 'Your time off request was **rejected**. Please reach out to your manager for more information.',
          },
        ],
      },
    ],
  },
  {
    name: 'Bug report',
    description: 'Team member fills out a bug report form and it gets posted to #bugs channel.',
    icon: '🐛',
    triggerType: 'shortcut',
    triggerConfig: { label: 'Report a bug' },
    steps: [
      {
        type: 'form',
        title: 'Bug Report',
        fields: [
          { name: 'title', label: 'Bug title', type: 'text', required: true },
          {
            name: 'severity',
            label: 'Severity',
            type: 'select',
            options: ['Critical', 'High', 'Medium', 'Low'],
            required: true,
          },
          { name: 'steps', label: 'Steps to reproduce', type: 'textarea', required: true },
          { name: 'expected', label: 'Expected behavior', type: 'text', required: false },
          { name: 'actual', label: 'Actual behavior', type: 'text', required: false },
        ],
        saveAs: 'form',
      },
      {
        type: 'post_to_channel',
        channelId: '',
        message: '**Bug Report: {{form.title}}**\n\nSeverity: {{form.severity}}\nReported by: {{triggeredBy}}\n\n**Steps to reproduce:**\n{{form.steps}}\n\n**Expected:** {{form.expected}}\n**Actual:** {{form.actual}}',
      },
    ],
  },
  {
    name: 'Standup reminder',
    description: 'Daily scheduled reminder that collects standup updates and posts a summary to the channel.',
    icon: '📋',
    triggerType: 'schedule',
    triggerConfig: { cron: '0 9 * * 1-5' },
    steps: [
      {
        type: 'form',
        title: 'Daily Standup',
        fields: [
          { name: 'yesterday', label: 'What did you do yesterday?', type: 'textarea', required: true },
          { name: 'today', label: 'What will you do today?', type: 'textarea', required: true },
          { name: 'blockers', label: 'Any blockers?', type: 'textarea', required: false },
        ],
        saveAs: 'standup',
      },
      {
        type: 'post_to_channel',
        channelId: '',
        message: '**Standup Update**\n\n**Yesterday:** {{standup.yesterday}}\n**Today:** {{standup.today}}\n**Blockers:** {{standup.blockers}}',
      },
    ],
  },
  {
    name: 'Newsroom article pipeline',
    description:
      'Reporter drafts → Editor edits → FactChecker verifies → Publisher finalizes and writes to canvas.',
    icon: '📰',
    triggerType: 'shortcut',
    triggerConfig: { label: 'Write news article' },
    steps: [
      {
        type: 'form',
        title: 'Article topic',
        fields: [
          { name: 'topic', label: 'Topic', type: 'text', required: true },
          { name: 'lang', label: 'Language (ko/en)', type: 'select', options: ['ko', 'en'], required: false },
        ],
        saveAs: 'brief',
      },
      {
        type: 'invoke_skill',
        agent: 'Reporter',
        skillId: 'draft-article',
        inputs: { topic: '{{brief.topic}}', lang: '{{brief.lang}}' },
        saveAs: 'draft',
      },
      {
        type: 'invoke_skill',
        agent: 'Editor',
        skillId: 'edit-draft',
        inputs: { draft: '{{draft}}' },
        saveAs: 'edited',
      },
      {
        type: 'invoke_skill',
        agent: 'FactChecker',
        skillId: 'verify-article',
        inputs: { article: '{{edited}}' },
        saveAs: 'verdict',
      },
      {
        type: 'invoke_skill',
        agent: 'Publisher',
        skillId: 'finalize-article',
        inputs: { article: '{{edited}}', verdict: '{{verdict}}' },
        saveAs: 'final',
      },
      {
        type: 'write_canvas',
        channel: '',
        content: '{{final}}',
        title: '{{brief.topic}}',
      },
      {
        type: 'post_to_channel',
        channelId: '',
        message: '**[PUBLISHED ✅]** {{brief.topic}}\n\nFull article saved to the channel canvas.',
      },
    ],
  },
];

interface WorkflowTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated: () => void;
}

export default function WorkflowTemplates({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: WorkflowTemplatesProps) {
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUseTemplate(template: WorkflowTemplate) {
    setCreating(template.name);
    setError(null);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          triggerType: template.triggerType,
          triggerConfig: template.triggerConfig,
          steps: template.steps,
          workspaceId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create workflow');
      }
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow from template');
    } finally {
      setCreating(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Workflow Templates</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-400 -mt-2">Choose a template to create a new workflow. You can edit it after creation.</p>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="space-y-3">
          {TEMPLATES.map((template) => (
            <div
              key={template.name}
              className="border border-white/10 rounded-lg p-4 bg-white/5 flex items-start gap-3"
            >
              <span className="text-2xl shrink-0">{template.icon}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white">{template.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{template.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                    {template.triggerType}
                  </span>
                  <span className="text-xs text-slate-500">
                    {template.steps.length} step{template.steps.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleUseTemplate(template)}
                disabled={creating === template.name}
                className="bg-[#4a154b] hover:bg-[#611f6a] text-white shrink-0 h-8 text-xs px-3"
              >
                {creating === template.name ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Use template'
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
