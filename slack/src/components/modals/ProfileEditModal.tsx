'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/lib/hooks/use-auth';
import { Upload, Loader2 } from 'lucide-react';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
}

// Common IANA timezones for the dropdown
const COMMON_TIMEZONES = [
  'Pacific/Midway',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/Sao_Paulo',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Paris',
  'Europe/Helsinki',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function formatTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${tz.replace(/_/g, ' ')} (${offset})`;
  } catch {
    return tz;
  }
}

export default function ProfileEditModal({ open, onClose }: ProfileEditModalProps) {
  const { user, mutate } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [timezone, setTimezone] = useState(
    user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when user data loads
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
      setTimezone(user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [user]);

  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setUploadError(data.error ?? 'Upload failed');
        return;
      }

      const data = await res.json();
      setAvatarUrl(data.url);
    } catch {
      setUploadError('Network error during upload');
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          avatarUrl,
          timezone,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save');
        return;
      }
      await mutate();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  // Ensure the detected timezone is in the list
  const allTimezones = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#222529] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Avatar preview + upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="w-16 h-16 border-2 border-white/20">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-[#4a154b] text-white text-xl font-semibold">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : initials}
                </AvatarFallback>
              </Avatar>
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 text-xs"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? 'Uploading…' : 'Upload photo'}
              </Button>
              <p className="text-xs text-slate-500">JPG, PNG, GIF up to 25MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}

          {/* Display name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">Display Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-500 focus:border-[#4a154b]"
            />
          </div>

          {/* Avatar URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">Avatar URL</label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
              className="bg-[#1a1d21] border-white/10 text-white placeholder:text-slate-500 focus:border-[#4a154b]"
            />
            <p className="text-xs text-slate-500">Or paste a URL directly (JPG, PNG, GIF)</p>
          </div>

          {/* Timezone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="bg-[#1a1d21] border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4a154b]"
            >
              {allTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {formatTimezoneLabel(tz)}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || uploading}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
