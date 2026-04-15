function getBaseURL() {
  if (typeof window === 'undefined') {
    return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3011';
  }
  return process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`;
}

export type User = {
  id: string;
  walletAddress: string;
  name: string;
  image: string | null;
  createdAt: string;
};

export async function getSession(): Promise<User | null> {
  try {
    const res = await fetch(`${getBaseURL()}/api/v1/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data as User;
  } catch {
    return null;
  }
}
