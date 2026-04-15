import { type Page, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
const APP_BASE = process.env.APP_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * A deterministic test wallet address. Using a valid EIP-55 checksummed address
 * so the API's `getAddress()` normalisation doesn't reject it.
 */
export const TEST_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/**
 * Authenticate via the API's /api/auth/connect endpoint (wallet-address only,
 * no actual signing required) and inject the resulting session cookie into the
 * Playwright browser context so every subsequent request is authenticated.
 *
 * Returns the authenticated User object returned by the API.
 */
export async function authenticateTestUser(page: Page) {
  // Call the API directly from Node (no browser context needed for this step)
  const res = await page.request.post(`${API_BASE}/api/auth/connect`, {
    data: { walletAddress: TEST_WALLET_ADDRESS },
  });

  if (!res.ok()) {
    throw new Error(
      `Auth failed: ${res.status()} ${await res.text()}`,
    );
  }

  const body = await res.json() as { user: { id: string; walletAddress: string; name: string } };

  // The API sets a session_token cookie via Set-Cookie. Playwright's request
  // context automatically stores cookies so subsequent page.goto() calls will
  // carry the cookie if the domain matches. However, to be explicit we also
  // set the cookie on the browser context.
  const cookies = res.headers()['set-cookie'];
  if (cookies) {
    const match = cookies.match(/session_token=([^;]+)/);
    if (match) {
      await page.context().addCookies([
        {
          name: 'session_token',
          value: match[1]!,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
    }
  }

  return body.user;
}

/**
 * Navigate to the workspace list, pick the first workspace, and return its id.
 * Assumes the user is already authenticated.
 */
export async function getFirstWorkspaceId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API_BASE}/api/v1/workspaces`);
  if (!res.ok()) throw new Error(`Failed to list workspaces: ${res.status()}`);
  const workspaces = await res.json() as Array<{ id: string }>;
  if (!workspaces.length) throw new Error('No workspaces found for test user');
  return workspaces[0]!.id;
}

/**
 * Create a page via the REST API.
 * Returns the created page object (id, title, …).
 */
export async function createPage(
  request: APIRequestContext,
  workspaceId: string,
  title = 'Test Page',
): Promise<{ id: string; title: string }> {
  const res = await request.post(`${API_BASE}/api/v1/pages`, {
    data: { workspaceId, title, type: 'page' },
  });
  if (!res.ok()) throw new Error(`Failed to create page: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<{ id: string; title: string }>;
}

/**
 * Create a database block via the REST API.
 */
export async function createDatabase(
  request: APIRequestContext,
  workspaceId: string,
  title = 'Test Database',
): Promise<{ id: string; title: string }> {
  const res = await request.post(`${API_BASE}/api/v1/databases`, {
    data: { workspaceId, title },
  });
  if (!res.ok()) throw new Error(`Failed to create database: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<{ id: string; title: string }>;
}

/**
 * Navigate to a specific page URL and wait for the title element to appear.
 */
export async function navigateToPage(page: Page, workspaceId: string, pageId: string) {
  await page.goto(`${APP_BASE}/workspace/${workspaceId}/${pageId}`);
  // Wait for the page title to be visible — confirms the page loaded
  await page.waitForSelector('h1[contenteditable]', { timeout: 15_000 });
}

/**
 * Navigate to a specific database URL and wait for the view tabs to appear.
 */
export async function navigateToDatabase(page: Page, workspaceId: string, databaseId: string) {
  await page.goto(`${APP_BASE}/workspace/${workspaceId}/database/${databaseId}`);
  await page.waitForSelector('[data-testid="database-view"]', { timeout: 15_000 });
}

/**
 * Full login flow: authenticate via API, navigate to /workspace, and wait for
 * the sidebar to be visible.
 */
export async function loginAndGoToWorkspace(page: Page) {
  await authenticateTestUser(page);
  await page.goto(`${APP_BASE}/workspace`);
  // /workspace redirects to the first workspace
  await page.waitForURL(/\/workspace\/[^/]+/, { timeout: 15_000 });
}
