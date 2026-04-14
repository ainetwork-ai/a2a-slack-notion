'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Web3Provider from '@/components/Web3Provider';
import WalletLogin from '@/components/auth/WalletLogin';

function LoginContent() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a1d21] via-[#1e1124] to-[#0d1117] p-4">
      <div className="w-full max-w-md">
        {invite && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
            <p className="text-sm text-green-400">You&apos;ve been invited to join Slack-A2A!</p>
            <p className="text-xs text-green-400/60 mt-1">Connect your wallet to get started.</p>
          </div>
        )}
        <WalletLogin />
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
