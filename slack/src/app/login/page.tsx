'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Web3Provider from '@/components/Web3Provider';
import WalletLogin from '@/components/auth/WalletLogin';
import KeyLogin from '@/components/auth/KeyLogin';
import { cn } from '@/lib/utils';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const [mode, setMode] = useState<'wallet' | 'key'>('wallet');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function handleTryDemo() {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const res = await fetch('/api/auth/demo-login', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDemoError(data.error || 'Demo login failed');
        return;
      }
      router.push('/workspace');
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Demo login failed');
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1d21] via-[#1e1124] to-[#0d1117] p-4">
      <div className="w-full max-w-md">
        {invite && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
            <p className="text-sm text-green-400">You&apos;ve been invited to join Slack-A2A!</p>
            <p className="text-xs text-green-400/60 mt-1">Connect your wallet to get started.</p>
          </div>
        )}

        {/* Try demo — skip login entirely */}
        <button
          onClick={handleTryDemo}
          disabled={demoLoading}
          className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#4a154b] to-[#611f6a] hover:from-[#611f6a] hover:to-[#7b2587] disabled:opacity-60 text-white font-semibold text-sm shadow-lg transition-all"
        >
          <Sparkles className="w-4 h-4" />
          {demoLoading ? 'Entering demo…' : 'Try the demo — no wallet needed'}
        </button>

        {demoError && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300 text-center">
            {demoError}
          </div>
        )}

        <div className="relative my-4">
          <div className="h-px bg-white/10" />
          <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-[#1e1124] px-2 text-[10px] uppercase tracking-wider text-slate-500">
            Or sign in
          </span>
        </div>

        <div className="flex gap-1 p-1 bg-white/5 rounded-lg mb-4">
          <button
            onClick={() => setMode('wallet')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              mode === 'wallet'
                ? 'bg-[#4a154b] text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            Wallet
          </button>
          <button
            onClick={() => setMode('key')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              mode === 'key'
                ? 'bg-[#4a154b] text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            Private key
          </button>
        </div>

        {mode === 'wallet' ? <WalletLogin /> : <KeyLogin />}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Web3Provider>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#1a1d21]" />}>
        <LoginContent />
      </Suspense>
    </Web3Provider>
  );
}
