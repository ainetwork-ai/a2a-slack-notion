'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        // Same-origin — the Notion API routes live under /api/v1 in this
        // same Next.js process (merged into Slack). Default-user middleware
        // returns a user for every request, so 401 is not expected.
        const res = await fetch('/api/v1/workspaces', { credentials: 'include' });
        if (!res.ok) return;
        const workspaces = (await res.json()) as { id: string }[];
        const first = workspaces[0];
        if (first) {
          router.replace(`/notion/workspace/${first.id}`);
        }
        // No workspace? Stay on /notion landing — public app, no onboarding/login redirect.
      } catch {
        /* ignore — public app, no fallback to login */
      }
    })();
  }, [router]);

  return null;
}
