'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ results?: { id: string }[] }>('/api/v1/workspaces');
        const workspaces = data?.results ?? [];
        if (workspaces.length > 0) {
          router.replace(`/workspace/${workspaces[0].id}`);
          return;
        }
      } catch {}
      router.replace('/onboarding');
    })();
  }, []);

  return null;
}
