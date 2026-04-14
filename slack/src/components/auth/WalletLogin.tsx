'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet, Zap } from 'lucide-react';

export default function WalletLogin() {
  const [displayName, setDisplayName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getChallenge(): Promise<string> {
    const res = await fetch('/api/auth/challenge');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to get challenge (${res.status}): ${text}`);
    }
    const data = await res.json();
    if (!data.message) throw new Error('Invalid challenge response');
    return data.message;
  }

  async function verifyAndRedirect(signature: string, address: string, provider: string) {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, address, displayName: displayName.trim(), provider }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      throw new Error(errData.error || `Verification failed (${res.status})`);
    }
    // Don't setIsLoading(false) — we're navigating away
    window.location.href = '/workspace';
    // Prevent finally from running setIsLoading(false) before navigation
    await new Promise(() => {}); // Never resolves — page will navigate
  }

  async function handleMetaMaskLogin() {
    if (!displayName.trim()) {
      setError('Please enter your display name.');
      return;
    }

    const ethereum = (window as unknown as { ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    } }).ethereum;

    if (!ethereum) {
      setError('MetaMask not detected. Please install MetaMask extension.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const address = accounts[0];
      if (!address) throw new Error('No account selected');

      const message = await getChallenge();

      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      }) as string;

      await verifyAndRedirect(signature, address, 'metamask');
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'MetaMask login failed. Please try again.';
      // MetaMask user rejection
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 4001) {
        setError('Login cancelled by user.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePrivateKeyLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!privateKey.trim() || !displayName.trim()) {
      setError('Please enter both your private key and display name.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const message = await getChallenge();

      const Ain = (await import('@ainblockchain/ain-js')).default;
      const ain = new Ain('https://devnet-api.ainetwork.ai', null, 0);
      const address = ain.wallet.add(privateKey.trim().replace(/^0x/, ''));
      if (!address) throw new Error('Invalid private key');
      ain.wallet.setDefaultAccount(address);
      const signature = ain.wallet.sign(message);

      await verifyAndRedirect(signature, address, 'ain');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
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
            placeholder="Your name in the workspace"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 focus:border-[#4a154b] focus:ring-[#4a154b]"
          />
        </div>

        <Tabs defaultValue="metamask" className="w-full">
          <TabsList className="w-full bg-[#222529] border border-white/10 mb-6">
            <TabsTrigger
              value="metamask"
              className="flex-1 data-[state=active]:bg-[#4a154b] data-[state=active]:text-white text-slate-400"
            >
              <Wallet className="w-4 h-4 mr-2" />
              MetaMask
            </TabsTrigger>
            <TabsTrigger
              value="privatekey"
              className="flex-1 data-[state=active]:bg-[#4a154b] data-[state=active]:text-white text-slate-400"
            >
              <Zap className="w-4 h-4 mr-2" />
              AIN Key
            </TabsTrigger>
          </TabsList>

          <TabsContent value="metamask">
            <div className="space-y-4">
              <div className="bg-[#222529] border border-white/10 rounded-lg p-4">
                <p className="text-sm text-slate-300">
                  Sign in using MetaMask. A signature request will appear — no transaction or gas fee required.
                </p>
              </div>
              <Button
                onClick={handleMetaMaskLogin}
                disabled={isLoading}
                className="w-full bg-[#f6851b] hover:bg-[#e2761b] text-white font-semibold py-2.5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect MetaMask'
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="privatekey">
            <form onSubmit={handlePrivateKeyLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">AIN Private Key</label>
                <Input
                  type="password"
                  placeholder="0x..."
                  value={privateKey}
                  onChange={e => setPrivateKey(e.target.value)}
                  className="bg-[#222529] border-white/10 text-white placeholder:text-slate-500 font-mono text-sm focus:border-[#4a154b]"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Your key never leaves your browser. Signing happens locally.
                </p>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#4a154b] hover:bg-[#611f6a] text-white font-semibold py-2.5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in with AIN Key'
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-600 mt-6">
        Powered by AIN Blockchain &amp; A2A Protocol
      </p>
    </div>
  );
}
