'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Web3Provider from '@/components/Web3Provider';
import WalletLogin from '@/components/auth/WalletLogin';
import KeyLogin from '@/components/auth/KeyLogin';
import { cn } from '@/lib/utils';

function LoginContent() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const [mode, setMode] = useState<'wallet' | 'key'>('wallet');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1d21] via-[#1e1124] to-[#0d1117] p-4">
      <div className="w-full max-w-md">
        {invite && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
            <p className="text-sm text-green-400">You&apos;ve been invited to join Slack-A2A!</p>
            <p className="text-xs text-green-400/60 mt-1">Connect your wallet to get started.</p>
          </div>
        )}

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
