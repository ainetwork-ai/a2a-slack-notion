'use client';

import { useState, useEffect } from 'react';
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

// No longer redirects to login — always considered authenticated
export function useRequireAuth(): { user: User | null; loading: boolean } {
  return useAuth();
}
