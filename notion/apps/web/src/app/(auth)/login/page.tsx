'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const [isDemoNavigating, setIsDemoNavigating] = useState(false);

  const apiUrl =
    typeof window !== 'undefined'
      ? (process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`)
      : 'http://localhost:3011';

  // 지갑 연결되면 자동으로 로그인 시도
  useEffect(() => {
    if (isConnected && address && !autoTriggered && !isLoading) {
      setAutoTriggered(true);
      handleLogin(address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  async function handleLogin(walletAddress: string) {
    setIsLoading(true);
    setError(null);
    try {
      setLoadingStep('Authenticating...');
      const res = await fetch(`${apiUrl}/api/auth/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletAddress }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Login failed');
      }

      // 성공 → 워크스페이스로 이동
      const returnUrl = searchParams?.get('return_url');
      router.replace(returnUrl ? decodeURIComponent(returnUrl) : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      disconnect();
      setAutoTriggered(false);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }

  function handleDemoClick() {
    const demoUrl = process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'];
    if (!demoUrl) return;
    setIsDemoNavigating(true);
    if (demoUrl.startsWith('/')) {
      router.push(demoUrl);
    } else {
      window.location.href = demoUrl;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
      <div className="w-full max-w-[384px] px-4">
        <div className="bg-[var(--bg-sidebar)] rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-modal)] text-center">
          <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--accent-blue)] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-white font-bold">N</span>
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">Sign in to Notion</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">Connect your wallet to continue</p>

          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-blue)]" />
              <p className="text-sm text-[var(--text-secondary)]">{loadingStep}</p>
            </div>
          ) : (
            <button
              onClick={() => {
                setError(null);
                setAutoTriggered(false);
                connect({ connector: injected() });
              }}
              disabled={isConnecting}
              className="w-full py-2.5 px-4 bg-[var(--accent-blue)] text-white text-sm font-medium rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isConnecting
                ? 'Connecting...'
                : isConnected
                  ? `Connected: ${address?.slice(0, 6)}...`
                  : 'Connect Wallet (MetaMask)'}
            </button>
          )}

          {error && (
            <div className="mt-3 p-2.5 bg-[var(--bg-red)] shadow-[0_0_0_1px_rgba(235,87,87,0.3)] rounded-[var(--radius-sm)]">
              <p className="text-xs text-[var(--color-red)]">{error}</p>
            </div>
          )}

          {isConnected && !isLoading && (
            <button
              onClick={() => {
                disconnect();
                setAutoTriggered(false);
              }}
              className="mt-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              Disconnect wallet
            </button>
          )}

          {/* Demo skip button — always last child, outside all conditionals */}
          {!isLoading && process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] && (
            <button
              type="button"
              onClick={handleDemoClick}
              disabled={isDemoNavigating}
              className="mt-3 w-full py-2 text-xs text-[var(--text-tertiary)]
                         border border-[var(--border-default)] rounded-[var(--radius-sm)]
                         hover:text-[var(--text-primary)] hover:border-[var(--border-active)]
                         disabled:opacity-50 transition-opacity"
              aria-label="Try demo workspace"
            >
              {isDemoNavigating ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Try Demo \u2192'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
