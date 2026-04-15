import { test, expect } from '@playwright/test';
import {
  authenticateTestUser,
  createPage,
  navigateToPage,
  getFirstWorkspaceId,
} from './helpers';

const API = 'http://localhost:3001';

test.describe('Permissions & sharing', () => {
  let workspaceId: string;
  let pageId: string;

  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
    workspaceId = await getFirstWorkspaceId(page.request);
    const created = await createPage(page.request, workspaceId, 'Shareable Page');
    pageId = created.id;
  });

  test.afterEach(async ({ page }) => {
    await page.request
      .delete(`${API}/api/v1/pages/${pageId}`)
      .catch(() => {});
  });

  test('share link can be created via the API', async ({ page }) => {
    const res = await page.request.post(`${API}/api/v1/pages/${pageId}/share`, {
      data: { allowPublic: true, role: 'viewer' },
    });

    // The endpoint should succeed
    expect(res.ok()).toBeTruthy();

    const body = await res.json() as { token?: string; shareUrl?: string };
    // Response should contain a share token or URL
    expect(body.token ?? body.shareUrl).toBeTruthy();
  });

  test('public share link is accessible without authentication', async ({ page, browser }) => {
    // Create a share link
    const createRes = await page.request.post(`${API}/api/v1/pages/${pageId}/share`, {
      data: { allowPublic: true, role: 'viewer' },
    });

    if (!createRes.ok()) {
      test.skip(true, 'Share endpoint not available');
      return;
    }

    const { token } = await createRes.json() as { token: string };

    // Open a fresh browser context with no auth cookies
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();

    await publicPage.goto(`http://localhost:3000/share/${token}`);

    // The public page should render the page title without requiring login
    await expect(publicPage.locator('h1')).toBeVisible({ timeout: 15_000 });
    await expect(publicPage).not.toHaveURL(/\/login/, { timeout: 3_000 }).catch(() => {
      // If it redirects to login, the public share link test failed
      throw new Error('Public share link redirected to login — access control issue');
    });

    await publicContext.close();
  });

  test('page permissions can be set via the API', async ({ page }) => {
    // Set page permission to full_access for the owner
    const res = await page.request.post(
      `${API}/api/v1/pages/${pageId}/permissions`,
      {
        data: { userId: 'self', role: 'full_access' },
      },
    );

    // This may return 200 or 201; either way it should not be a 4xx/5xx
    expect(res.status()).toBeLessThan(400);
  });

  test('permission level restricts actions — viewer cannot delete', async ({ page, browser }) => {
    // Create a share link with viewer role
    const shareRes = await page.request.post(`${API}/api/v1/pages/${pageId}/share`, {
      data: { allowPublic: true, role: 'viewer' },
    });

    if (!shareRes.ok()) {
      test.skip(true, 'Share endpoint not available');
      return;
    }

    const { token } = await shareRes.json() as { token: string };

    // Access the share link as an unauthenticated viewer
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(`http://localhost:3000/share/${token}`);

    // Wait for the page to load
    await viewerPage.waitForLoadState('networkidle');

    // The viewer should NOT see a Delete button or destructive actions
    const deleteBtn = viewerPage.getByRole('button', { name: /delete|trash/i });
    await expect(deleteBtn).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // Some UIs show the button but disable it — that's acceptable
      return expect(deleteBtn).toBeDisabled();
    });

    await viewerContext.close();
  });
});
