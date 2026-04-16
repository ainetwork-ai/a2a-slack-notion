'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { TriggerType } from './TriggerPicker';

export interface TriggerConfigData {
  // shortcut
  shortcutName?: string;
  shortcutChannel?: string;
  // schedule
  scheduleFrequency?: string;
  scheduleTime?: string;
  scheduleDays?: string[];
  // channel_message
  channelId?: string;
  keyword?: string;
  keywordEnabled?: boolean;
  // channel_join
  joinChannelId?: string;
  // webhook — no extra config needed
  // form — no extra config needed
  // mapped back to API triggerType
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FREQUENCY_OPTIONS = [
  { value: 'every day', label: 'every day' },
  { value: 'every weekday', label: 'every weekday' },
  { value: 'every week', label: 'every week' },
  { value: 'every month', label: 'every month' },
];

const TIME_OPTIONS = Array.from({ length: 24 * 2 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const min = i % 2 === 0 ? '00' : '30';
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { value: `${String(hour).padStart(2, '0')}:${min}`, label: `${h12}:${min} ${ampm}` };
});

interface TriggerConfigProps {
  triggerType: TriggerType;
  onContinue: (data: TriggerConfigData) => void;
  onBack: () => void;
}

export default function TriggerConfig({ triggerType, onContinue, onBack }: TriggerConfigProps) {
  const [shortcutName, setShortcutName] = useState('');
  const [shortcutChannel, setShortcutChannel] = useState('all channels');
  const [scheduleFrequency, setScheduleFrequency] = useState('every day');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [specificDays, setSpecificDays] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [channelId, setChannelId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keywordEnabled, setKeywordEnabled] = useState(false);
  const [joinChannelId, setJoinChannelId] = useState('');

  function toggleDay(day: string) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function buildData(): TriggerConfigData {
    switch (triggerType) {
      case 'shortcut':
        return {
          shortcutName,
          shortcutChannel,
          triggerType: 'shortcut',
          triggerConfig: { label: shortcutName, channelId: shortcutChannel !== 'all channels' ? shortcutChannel : undefined },
        };
      case 'schedule': {
        // Build a cron expression from the UI
        const [h, m] = scheduleTime.split(':');
        let cron = '';
        if (scheduleFrequency === 'every day') cron = `${m} ${h} * * *`;
        else if (scheduleFrequency === 'every weekday') cron = `${m} ${h} * * 1-5`;
        else if (scheduleFrequency === 'every week') cron = `${m} ${h} * * 1`;
        else if (scheduleFrequency === 'every month') cron = `${m} ${h} 1 * *`;
        return {
          scheduleFrequency,
          scheduleTime,
          scheduleDays: specificDays ? scheduleDays : undefined,
          triggerType: 'schedule',
          triggerConfig: { cron },
        };
      }
      case 'channel_message':
        return {
          channelId,
          keyword: keywordEnabled ? keyword : undefined,
          keywordEnabled,
          triggerType: 'channel_message',
          triggerConfig: { channelId, pattern: keywordEnabled && keyword ? keyword : undefined },
        };
      case 'channel_join':
        return {
          joinChannelId,
          triggerType: 'channel_join',
          triggerConfig: { channelId: joinChannelId },
        };
      case 'webhook':
        return { triggerType: 'manual', triggerConfig: {} };
      case 'form':
        return { triggerType: 'manual', triggerConfig: {} };
      default:
        return { triggerType: 'manual', triggerConfig: {} };
    }
  }

  const isValid = () => {
    if (triggerType === 'shortcut') return shortcutName.trim().length > 0;
    if (triggerType === 'channel_message') return channelId.trim().length > 0;
    if (triggerType === 'channel_join') return joinChannelId.trim().length > 0;
    return true;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Configure the trigger</h2>
        <p className="text-sm text-slate-400 mt-1">Set up how this workflow gets started</p>
      </div>

      <div className="bg-white/3 border border-white/10 rounded-xl p-6 space-y-5">
        {triggerType === 'shortcut' && (
          <>
            <p className="text-base text-slate-300">The shortcut will appear as</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Name</label>
                <Input
                  value={shortcutName}
                  onChange={(e) => setShortcutName(e.target.value)}
                  placeholder="e.g. Time off request"
                  className="bg-[#1a1d21] border-white/10 text-white text-base"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">In channel</label>
                <div className="relative">
                  <select
                    value={shortcutChannel}
                    onChange={(e) => setShortcutChannel(e.target.value)}
                    className="w-full bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm appearance-none pr-8"
                  >
                    <option value="all channels">all channels</option>
                    <option value="general">general</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

        {triggerType === 'schedule' && (
          <>
            <p className="text-base text-slate-300">Run this workflow</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value)}
                className="bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="text-slate-300">at</span>
              <select
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="bg-[#1a1d21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
              >
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={specificDays}
                onChange={(e) => setSpecificDays(e.target.checked)}
                className="rounded"
              />
              On specific days:
              {specificDays && (
                <div className="flex gap-1 ml-1">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        scheduleDays.includes(d)
                          ? 'bg-[#4a154b] text-white'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </label>
          </>
        )}

        {triggerType === 'channel_message' && (
          <>
            <div className="flex items-center gap-2 flex-wrap text-base text-slate-300">
              <span>When a message is posted in</span>
              <div className="inline-flex items-center gap-1">
                <span className="text-slate-400">#</span>
                <Input
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  placeholder="channel-name"
                  className="bg-[#1a1d21] border-white/10 text-white text-sm w-40 inline-block"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={keywordEnabled}
                onChange={(e) => setKeywordEnabled(e.target.checked)}
                className="rounded"
              />
              Only when it contains keyword:
              {keywordEnabled && (
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="help"
                  className="bg-[#1a1d21] border-white/10 text-white text-sm w-32 ml-1"
                />
              )}
            </label>
          </>
        )}

        {triggerType === 'channel_join' && (
          <div className="flex items-center gap-2 flex-wrap text-base text-slate-300">
            <span>When someone joins</span>
            <div className="inline-flex items-center gap-1">
              <span className="text-slate-400">#</span>
              <Input
                value={joinChannelId}
                onChange={(e) => setJoinChannelId(e.target.value)}
                placeholder="channel-name"
                className="bg-[#1a1d21] border-white/10 text-white text-sm w-40 inline-block"
              />
            </div>
          </div>
        )}

        {triggerType === 'webhook' && (
          <div className="space-y-2">
            <p className="text-base text-slate-300">This workflow will be triggered via a webhook</p>
            <p className="text-sm text-slate-400">A unique webhook URL will be generated after you publish the workflow.</p>
          </div>
        )}

        {triggerType === 'form' && (
          <div className="space-y-2">
            <p className="text-base text-slate-300">This workflow starts when a form is submitted</p>
            <p className="text-sm text-slate-400">Configure form fields in the steps section below.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-400 hover:text-white">
          Back
        </Button>
        <Button
          onClick={() => onContinue(buildData())}
          disabled={!isValid()}
          className="bg-[#4a154b] hover:bg-[#611f6a] text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
