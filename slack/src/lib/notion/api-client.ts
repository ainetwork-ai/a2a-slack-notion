function getApiUrl() {
  if (typeof window === 'undefined') {
    return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3011';
  }
  return process.env['NEXT_PUBLIC_API_URL'] ?? `${window.location.protocol}//${window.location.hostname}:3011`;
}

const API_URL = getApiUrl();

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API Error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
