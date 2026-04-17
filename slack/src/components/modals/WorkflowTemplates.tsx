'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { NEWSROOM_TEMPLATE } from '@/lib/workflow/templates/notion-newsroom';
import type { WorkflowStep } from '@/lib/workflow/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function templateNeedsChannel(template: WorkflowTemplate): boolean {
  const walk = (steps: WorkflowStep[]): boolean => {
    for (const s of steps) {
      if (
        ('channel' in s && (s.channel as string | undefined) === '') ||
        (s.type === 'form' && s.submitToChannel === '')
      )
        return true;
      if (s.type === 'condition') {
        if (walk(s.then) || walk(s.else ?? [])) return true;
      }
    }
    return false;
  };
  const trigCfg = template.triggerConfig as { channel?: string };
  if (trigCfg.channel === '') return true;
  return walk(template.steps);
}

function substituteChannel(steps: WorkflowStep[], channel: string): WorkflowStep[] {
  return steps.map((step) => {
    const s = step as unknown as Record<string, unknown>;
    const next = { ...s };
    if ('channel' in next && next.channel === '') next.channel = channel;
    if (step.type === 'form' && next.submitToChannel === '') next.submitToChannel = channel;
    if (step.type === 'condition') {
      next.then = substituteChannel(step.then, channel);
      if (step.else) next.else = substituteChannel(step.else, channel);
    }
    return next as WorkflowStep;
  });
}

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
    triggerConfig: { channel: '' },
    steps: [
      {
        type: 'dm_user',
        user: '{{triggeredBy}}',
        message: 'Welcome to the team! Here are some tips to get started:\n\n• Check out #general for announcements\n• Use /help for available commands\n\nLet us know if you need anything!',
      },
      {
        type: 'add_to_channel',
        channel: '',
        user: '{{triggeredBy}}',
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
        approver: '',
        message: 'Time off request from {{triggeredBy}}:\n\n• Dates: {{form.start_date}} to {{form.end_date}}\n• Type: {{form.type}}\n• Reason: {{form.reason}}',
        saveAs: 'approval',
      },
      {
        type: 'condition',
        if: 'approval',
        then: [
          {
            type: 'dm_user',
            user: '{{triggeredBy}}',
            message: 'Your time off request has been **approved**! Enjoy your time off.',
          },
        ],
        else: [
          {
            type: 'dm_user',
            user: '{{triggeredBy}}',
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
        channel: '',
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
        channel: '',
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
      // Create a dedicated canvas for this article — its ID flows through all agent steps
      {
        type: 'create_canvas',
        channel: '',
        title: '{{brief.topic}}',
        topic: '{{brief.topic}}',
        saveAs: 'articleCanvasId',
      },
      {
        type: 'invoke_skill',
        agent: 'Reporter',
        skillId: 'draft-article',
        inputs: { topic: '{{brief.topic}}', lang: '{{brief.lang}}', canvasId: '{{articleCanvasId}}' },
        saveAs: 'draft',
      },
      {
        type: 'invoke_skill',
        agent: 'Editor',
        skillId: 'edit-draft',
        inputs: { draft: '{{draft}}', canvasId: '{{articleCanvasId}}' },
        saveAs: 'edited',
      },
      {
        type: 'invoke_skill',
        agent: 'FactChecker',
        skillId: 'verify-article',
        inputs: { article: '{{edited}}', canvasId: '{{articleCanvasId}}' },
        saveAs: 'verdict',
      },
      {
        type: 'invoke_skill',
        agent: 'Publisher',
        skillId: 'finalize-article',
        inputs: { article: '{{edited}}', verdict: '{{verdict}}', canvasId: '{{articleCanvasId}}' },
        saveAs: 'final',
      },
      {
        type: 'post_to_channel',
        channel: '',
        message: '**[PUBLISHED ✅]** {{brief.topic}}\n\nFull article written to canvas.',
      },
    ],
  },
  {
    name: 'Unblock 편집 파이프라인',
    description:
      '채널 메시지 트리거 → Damien 배정 → 기자 리포트 → 팀장 가이드 → 초안 → 피드백 → 수정 → 최종 승인 (7단계 A2A 파이프라인)',
    icon: '📝',
    triggerType: 'channel_message',
    triggerConfig: { channel: 'unblockmedia-test-1', pattern: 'start-writing-article' },
    steps: [
      // Step 1: Damien assigns reporter + manager
      {
        type: 'invoke_skill',
        agent: 'damien',
        skillId: 'assignment',
        inputs: {
          TODAY_DATE: new Date().toISOString().slice(0, 10),
          BASIC_ARTICLE_SOURCE: '{{trigger.body}}',
        },
        saveAs: 'assignment',
      },
      // Step 2: Parse assignment to extract reporter/manager IDs
      {
        type: 'parse_assignment',
        input: '{{assignment}}',
        saveAs: 'routing',
      },
      // Step 3: Reporter market research
      {
        type: 'invoke_skill',
        agent: '{{routing.reporter}}',
        skillId: 'report',
        inputs: {
          TODAY_DATE: new Date().toISOString().slice(0, 10),
          BASIC_ARTICLE_SOURCE: '{{trigger.body}}',
          CHIEF_COMMENT: '{{assignment}}',
        },
        saveAs: 'report',
      },
      // Step 4: Manager gives writing guide
      {
        type: 'invoke_skill',
        agent: '{{routing.manager}}',
        skillId: 'guide',
        inputs: {
          REPORTER: '{{routing.reporterKor}}',
          MARKET_RESEARCH: '{{report}}',
        },
        saveAs: 'guide',
      },
      // Step 5: Reporter writes article draft
      {
        type: 'invoke_skill',
        agent: '{{routing.reporter}}',
        skillId: 'writing',
        inputs: {
          MARKET_RESEARCH: '{{report}}',
          ARTICLE_GUIDE: '{{guide}}',
        },
        saveAs: 'draft',
      },
      // Step 6: Manager feedback on draft
      {
        type: 'invoke_skill',
        agent: '{{routing.manager}}',
        skillId: 'feedback',
        inputs: {
          REPORTER: '{{routing.reporterKor}}',
          TODAY_DATE: new Date().toISOString().slice(0, 10),
          BASIC_ARTICLE_SOURCE: '{{trigger.body}}',
          ARTICLE_DRAFT: '{{draft}}',
        },
        saveAs: 'feedback',
      },
      // Step 7: Reporter revises based on feedback
      {
        type: 'invoke_skill',
        agent: '{{routing.reporter}}',
        skillId: 'revision',
        inputs: {
          ARTICLE_DRAFT: '{{draft}}',
          MANAGER_FEEDBACK: '{{feedback}}',
        },
        saveAs: 'revision',
      },
      // Step 8: Damien confirms or rejects
      {
        type: 'invoke_skill',
        agent: 'damien',
        skillId: 'confirm',
        inputs: {
          REPORTER: '{{routing.reporterKor}}',
          TODAY_DATE: new Date().toISOString().slice(0, 10),
          CORRECTED_ARTICLE: '{{revision}}',
        },
        saveAs: 'confirm',
      },
      // Step 9: Post result to channel
      {
        type: 'post_to_channel',
        channel: '',
        message:
          '**[편집 파이프라인 완료]** {{routing.reporterKor}} 기자 기사\n\n{{confirm}}',
      },
    ],
  },
  NEWSROOM_TEMPLATE,
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
  const [channelByTemplate, setChannelByTemplate] = useState<Record<string, string>>({});

  const { data: channels } = useSWR<Array<{ id: string; name: string }>>(
    open ? '/api/channels' : null,
    fetcher
  );

  useEffect(() => {
    if (!channels || channels.length === 0) return;
    const pref =
      channels.find((c) => /newsroom/i.test(c.name)) ??
      channels.find((c) => /general/i.test(c.name)) ??
      channels[0];
    setChannelByTemplate((prev) => {
      const next = { ...prev };
      for (const t of TEMPLATES) {
        if (templateNeedsChannel(t) && !next[t.name]) next[t.name] = pref.name;
      }
      return next;
    });
  }, [channels]);

  async function handleUseTemplate(template: WorkflowTemplate) {
    setCreating(template.name);
    setError(null);
    try {
      const needsChannel = templateNeedsChannel(template);
      const pickedChannel = channelByTemplate[template.name] || '';
      if (needsChannel && !pickedChannel) {
        throw new Error('Pick a target channel for this template first.');
      }
      const resolvedSteps = needsChannel
        ? substituteChannel(template.steps, pickedChannel)
        : template.steps;
      const resolvedTriggerCfg = { ...template.triggerConfig };
      if ((resolvedTriggerCfg as { channel?: string }).channel === '') {
        (resolvedTriggerCfg as { channel?: string }).channel = pickedChannel;
      }

      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          triggerType: template.triggerType,
          triggerConfig: resolvedTriggerCfg,
          steps: resolvedSteps,
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
              <span
                className="text-2xl shrink-0 w-8 h-8 flex items-center justify-center leading-none"
                style={{
                  fontFamily:
                    '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color","Android Emoji",sans-serif',
                }}
              >
                {template.icon}
              </span>
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
                {templateNeedsChannel(template) && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-slate-400">Target channel:</label>
                    <select
                      value={channelByTemplate[template.name] ?? ''}
                      onChange={(e) =>
                        setChannelByTemplate((prev) => ({
                          ...prev,
                          [template.name]: e.target.value,
                        }))
                      }
                      className="bg-[#0f1114] border border-white/10 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="">— pick —</option>
                      {(channels ?? []).map((c) => (
                        <option key={c.id} value={c.name}>#{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
