import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export interface User {
  id: string;
  address: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: string;
}

export function useAuth() {
  const { data, isLoading, mutate } = useSWR<{ user: User }>('/api/auth/me', fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  async function login(privateKey: string, displayName: string) {
    const challengeRes = await fetch('/api/auth/challenge');
    if (!challengeRes.ok) throw new Error('Failed to get challenge');
    const { message } = await challengeRes.json();

    const Ain = (await import('@ainblockchain/ain-js')).default;
    const ain = new Ain('https://devnet-api.ainetwork.ai', null, 0);
    const address = ain.wallet.add(privateKey.replace(/^0x/, ''));
    if (!address) throw new Error('Invalid private key');
    ain.wallet.setDefaultAccount(address);

    const signature = ain.wallet.sign(message);

    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, address, displayName }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      throw new Error(err.error || 'Verification failed');
    }

    await mutate();
    return verifyRes.json();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return {
    user: data?.user ?? null,
    isLoading,
    mutate,
    login,
    logout,
  };
}
