// Same-origin API calls — the Notion API lives at /api/v1/* in the same
// Next.js app, so callers use relative URLs.
const API_URL = '';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    // Public app — default-user middleware should always supply a user.
    // If we ever see 401, fall back to the notion home rather than a deleted login page.
    if (typeof window !== 'undefined') {
      window.location.replace('/notion');
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API Error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
