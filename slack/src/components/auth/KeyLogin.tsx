'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'slack-a2a:saved-key';

interface SavedKey {
  privateKey: string;
  displayName: string;
  ainAddress: string;
  savedAt: number;
}

function loadSaved(): SavedKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedKey;
  } catch {
    return null;
  }
}

function maskKey(key: string) {
  if (key.length <= 12) return '*'.repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export default function KeyLogin() {
  const [privateKey, setPrivateKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedKey | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  async function login(keyToUse: string, nameToUse?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/key-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: keyToUse,
          displayName: nameToUse?.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Login failed');
        return;
      }
      const user = body.user;
      if (remember && !saved) {
        const entry: SavedKey = {
          privateKey: keyToUse,
          displayName: user.displayName,
          ainAddress: user.ainAddress,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
      }
      window.location.href = '/workspace';
    } finally {
      setLoading(false);
    }
  }

  function clearSaved() {
    window.localStorage.removeItem(STORAGE_KEY);
    setSaved(null);
  }

  // Saved key — 1Password-style quick login row
  if (saved && !expanded) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => login(saved.privateKey)}
          disabled={loading}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#4a154b]/40 transition-colors text-left disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-full bg-[#4a154b]/30 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-[#e879f9]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{saved.displayName}</p>
            <p className="text-[11px] text-slate-500 truncate font-mono">{saved.ainAddress}</p>
          </div>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <span className="text-[10px] text-slate-500">Click to sign in</span>
          )}
        </button>

        <div className="flex items-center justify-between text-[11px]">
          <button
            onClick={() => setExpanded(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            Use a different key
          </button>
          <button
            onClick={clearSaved}
            className="flex items-center gap-1 text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Forget this key
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Paste-key form
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-[11px] text-slate-400 uppercase tracking-wide">Private key</label>
        <div className="relative">
          <Input
            type={show ? 'text' : 'password'}
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Paste your AIN private key (hex)"
            className="bg-[#222529] border-white/10 text-white placeholder:text-slate-600 font-mono text-xs pr-9"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {privateKey.length > 0 && privateKey.length < 32 && (
          <p className="text-[11px] text-amber-400/80">Key looks short — paste the full hex value.</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-slate-400 uppercase tracking-wide">Display name (new accounts only)</label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="optional"
          className="bg-[#222529] border-white/10 text-white placeholder:text-slate-600"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="rounded"
        />
        Remember on this device (stored in browser localStorage)
      </label>

      {remember && (
        <div className="text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded p-2">
          ⚠ Anyone with access to this browser will be able to sign in.
        </div>
      )}

      <Button
        onClick={() => login(privateKey, displayName)}
        disabled={loading || privateKey.length < 32}
        className="w-full bg-[#4a154b] hover:bg-[#4a154b]/90 text-white"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Signing in…
          </>
        ) : (
          <>
            <Key className="w-4 h-4 mr-2" /> Sign in with private key
          </>
        )}
      </Button>

      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          ← Back to saved key{saved ? ` (${maskKey(saved.privateKey)})` : ''}
        </button>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}
