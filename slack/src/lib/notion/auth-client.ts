function getBaseURL() {
  // Same-origin — the Notion API lives at /api/v1/* in this merged Next.js app.
  return '';
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
