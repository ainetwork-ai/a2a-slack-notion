import type { NextRequest } from 'next/server';

/**
 * Resolve the public origin the current request arrived on, so the
 * AgentCard's `url` field reflects the actual reachable address — whether
 * we're running on localhost, behind ngrok, or on Vercel.
 */
export function getBaseUrl(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = req.headers.get('host');
  if (host) {
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocal ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  return 'http://localhost:3000';
}
