'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Hash, Lock } from 'lucide-react';
import { useChannels } from '@/lib/hooks/use-channels';
import { useAppStore } from '@/lib/stores/app-store';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function CreateChannelModal() {
  const router = useRouter();
  const { createChannelOpen, setCreateChannelOpen } = useAppStore();
  const { activeWorkspaceId } = useWorkspaceStore();
  const { createChannel } = useChannels(activeWorkspaceId ?? undefined);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-convert: lowercase, spaces→hyphens, strip invalid chars, max 80 chars
  const slugName = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 80);

  const nameValidationError =
    name.trim() === ''
      ? null
      : slugName.length === 0
      ? 'Channel name must contain letters, numbers, hyphens, or underscores.'
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Channel name is required.');
      return;
    }
    if (nameValidationError) {
      setError(nameValidationError);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await createChannel({ name: slugName, description, isPrivate, workspaceId: activeWorkspaceId ?? undefined });
      setCreateChannelOpen(false);
      setName('');
      setDescription('');
      setIsPrivate(false);
      if (result?.channel?.name) {
        router.push(`/workspace/channel/${encodeURIComponent(result.channel.name)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    setCreateChannelOpen(false);
    setName('');
    setDescription('');
    setIsPrivate(false);
    setError(null);
  }

  return (
    <Dialog open={createChannelOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Create a channel</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="text"
                placeholder="e.g. announcements"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 pl-9"
                autoFocus
              />
            </div>
            {name && slugName !== name.toLowerCase() && slugName.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Will be created as #{slugName}</p>
            )}
            {nameValidationError && (
              <p className="text-xs text-red-400 mt-1">{nameValidationError}</p>
            )}
            {slugName.length >= 70 && (
              <p className="text-xs text-slate-500 mt-1">{slugName.length}/80 characters</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description <span className="text-slate-500">(optional)</span>
            </label>
            <Textarea
              placeholder="What is this channel about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 resize-none"
              rows={3}
            />
          </div>

          {/* Private toggle */}
          <div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg border transition-colors',
                isPrivate
                  ? 'border-[#4a154b]/60 bg-[#4a154b]/20'
                  : 'border-white/10 bg-[#222529] hover:bg-white/5'
              )}
            >
              <div className="flex items-center gap-3">
                <Lock className={cn('w-4 h-4', isPrivate ? 'text-[#e879f9]' : 'text-slate-400')} />
                <div className="text-left">
                  <p className="text-sm font-medium text-white">Make private</p>
                  <p className="text-xs text-slate-400">Only invited members can see this channel</p>
                </div>
              </div>
              <div className={cn(
                'w-10 h-6 rounded-full relative transition-colors',
                isPrivate ? 'bg-[#4a154b]' : 'bg-slate-600'
              )}>
                <div className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                  isPrivate ? 'left-5' : 'left-1'
                )} />
              </div>
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="bg-[#4a154b] hover:bg-[#611f6a] text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Channel'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
