'use client';

import { Zap, Clock, Webhook, FileText, UserPlus, MessageSquare } from 'lucide-react';

export type TriggerType =
  | 'shortcut'
  | 'schedule'
  | 'webhook'
  | 'form'
  | 'channel_join'
  | 'channel_message';

interface TriggerOption {
  type: TriggerType;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    type: 'shortcut',
    icon: <Zap className="w-6 h-6 text-yellow-400" />,
    title: 'Shortcut',
    description: 'From a shortcut in Slack (e.g. a lightning bolt button)',
  },
  {
    type: 'schedule',
    icon: <Clock className="w-6 h-6 text-blue-400" />,
    title: 'Scheduled',
    description: 'On a schedule (e.g. every Monday at 9am)',
  },
  {
    type: 'webhook',
    icon: <Webhook className="w-6 h-6 text-green-400" />,
    title: 'Webhook',
    description: 'From a webhook (e.g. from an external app)',
  },
  {
    type: 'form',
    icon: <FileText className="w-6 h-6 text-purple-400" />,
    title: 'Form submitted',
    description: 'When a form is submitted',
  },
  {
    type: 'channel_join',
    icon: <UserPlus className="w-6 h-6 text-cyan-400" />,
    title: 'Channel member added',
    description: 'When someone joins a channel',
  },
  {
    type: 'channel_message',
    icon: <MessageSquare className="w-6 h-6 text-orange-400" />,
    title: 'Message posted',
    description: 'When a message is posted in a channel',
  },
];

interface TriggerPickerProps {
  onSelect: (type: TriggerType) => void;
}

export default function TriggerPicker({ onSelect }: TriggerPickerProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Start the workflow...</h2>
        <p className="text-sm text-slate-400 mt-1">Choose what triggers this workflow to run</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {TRIGGER_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onSelect(opt.type)}
            className="flex items-start gap-4 p-4 rounded-lg border border-white/10 bg-white/3 hover:bg-white/8 hover:border-white/20 transition-all text-left group"
          >
            <div className="shrink-0 mt-0.5 p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
              {opt.icon}
            </div>
            <div>
              <div className="font-medium text-white text-base">{opt.title}</div>
              <div className="text-sm text-slate-400 mt-0.5">{opt.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
