'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function getApiUrl() {
  if (typeof window === 'undefined') {
    return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3011';
  }
  return process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`;
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/v1/workspaces`, { credentials: 'include' });
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        if (!res.ok) {
          router.replace('/onboarding');
          return;
        }
        const workspaces = (await res.json()) as { id: string }[];
        const first = workspaces[0];
        if (first) {
          router.replace(`/workspace/${first.id}`);
          return;
        }
        router.replace('/onboarding');
      } catch {
        router.replace('/onboarding');
      }
    })();
  }, []);

  return null;
}
