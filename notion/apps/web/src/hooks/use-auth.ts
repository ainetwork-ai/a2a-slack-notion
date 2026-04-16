'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, type User } from '@/lib/auth-client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}

export function useRequireAuth(): { user: User | null; loading: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?return_url=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname]);

  return { user, loading };
}
