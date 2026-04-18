'use client';

/**
 * Legacy path — redirects to the unified top-level /invite/<token> page.
 * Notion and Slack share the same invite tokens now.
 */

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function NotionInviteRedirect() {
  const router = useRouter();
  const params = useParams();
  const token = params['token'] as string;

  useEffect(() => {
    if (token) router.replace(`/invite/${token}`);
    else router.replace('/');
  }, [token, router]);

  return null;
}
