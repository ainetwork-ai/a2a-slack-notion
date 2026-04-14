'use client';

import { useState, useEffect } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Zap } from 'lucide-react';

export default function WalletLogin() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoSignTriggered, setAutoSignTriggered] = useState(false);

  // Read invite token from URL
  const inviteToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('invite')
    : null;

  // When wallet connects, auto-start the sign flow
  useEffect(() => {
    if (isConnected && address && !autoSignTriggered && !isLoading) {
      setAutoSignTriggered(true);
      handleSign(address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  async function handleSign(walletAddress: string) {
    setIsLoading(true);
    setError(null);

    try {
      // Auto-detect existing user
      setLoadingStep('Checking account...');
      let resolvedName = displayName.trim();
      if (!resolvedName) {
        const lookupRes = await fetch(`/api/auth/lookup?address=${encodeURIComponent(walletAddress)}`);
        if (lookupRes.ok) {
          const { user: existingUser } = await lookupRes.json();
          if (existingUser?.displayName) {
            resolvedName = existingUser.displayName;
            setDisplayName(resolvedName);
          }
        }
      }
      const finalName = resolvedName || `User-${walletAddress.slice(0, 6)}`;

      // Get challenge
      setLoadingStep('Getting challenge...');
      const challengeRes = await fetch('/api/auth/challenge');
      if (!challengeRes.ok) throw new Error('Failed to get challenge');
      const { message } = await challengeRes.json();

      // Sign
      setLoadingStep('Sign the message in your wallet...');
      const signature = await signMessageAsync({ message });

      // Verify
      setLoadingStep('Verifying...');
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          address: walletAddress,
          displayName: finalName,
          provider: 'metamask',
          inviteToken: inviteToken ?? undefined,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({ error: 'Verification failed' }));
        throw new Error(errData.error || 'Verification failed');
      }

      window.location.href = '/workspace';
      await new Promise(() => {}); // Block until navigation
    } catch (err: unknown) {
      console.error('[Login] Error:', err);
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Login failed. Please try again.';

      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: number }).code;
        if (code === 4001) {
          setError('Signature rejected. Please try again.');
        } else {
          setError(msg);
        }
      } else {
        setError(msg);
      }

      disconnect();
      setAutoSignTriggered(false);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#4a154b] mb-4 shadow-lg">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Slack-A2A</h1>
        <p className="text-slate-400 mt-2 text-sm">Agent-to-Agent communication on AIN blockchain</p>
      </div>

      <div className="bg-[#1a1d21] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-6">Sign in to your workspace</h2>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
          <Input
            type="text"
            placeholder="Your name (optional for returning users)"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            disabled={isLoading}
            className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 focus:border-[#4a154b] focus:ring-[#4a154b]"
          />
        </div>

        {isLoading ? (
          <Button disabled className="w-full bg-[#f6851b] text-white font-semibold py-2.5">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {loadingStep || 'Connecting...'}
          </Button>
        ) : (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <Button
                onClick={show}
                className="w-full bg-[#f6851b] hover:bg-[#e2761b] text-white font-semibold py-2.5"
              >
                {isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : 'Connect Wallet'}
              </Button>
            )}
          </ConnectKitButton.Custom>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {isConnected && !isLoading && (
          <button
            onClick={() => { disconnect(); setAutoSignTriggered(false); }}
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300"
          >
            Disconnect wallet
          </button>
        )}
      </div>

      <p className="text-center text-xs text-slate-600 mt-6">
        Powered by AIN Blockchain &amp; A2A Protocol
      </p>
    </div>
  );
}
