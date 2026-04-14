'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';

interface ProfileSetupProps {
  open: boolean;
  onComplete: (displayName: string, avatarUrl?: string) => Promise<void>;
}

export default function ProfileSetup({ open, onComplete }: ProfileSetupProps) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await onComplete(displayName.trim(), avatarUrl.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent className="bg-[#1a1d21] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">Set up your profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          {/* Avatar preview */}
          <div className="flex justify-center">
            <Avatar className="w-20 h-20 border-2 border-white/10">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-[#4a154b] text-white text-2xl font-semibold">
                {initials || '?'}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Display Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                placeholder="How should others see you?"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Avatar URL <span className="text-slate-500">(optional)</span>
              </label>
              <Input
                type="url"
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !displayName.trim()}
            className="w-full bg-[#4a154b] hover:bg-[#611f6a] text-white font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Continue to Workspace'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
