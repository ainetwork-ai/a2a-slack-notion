import { test, expect } from '@playwright/test';
import { authenticateTestUser } from './helpers';

test.describe('Authentication flow', () => {
  test('login page renders with wallet connector buttons', async ({ page }) => {
    await page.goto('/login');

    // Page title / branding
    await expect(page.getByText('Notion Clone')).toBeVisible();

    // At least one wallet connector button should be present once mounted.
    // The buttons say "<ConnectorName>으로 연결".
    // We look for any button whose text contains "연결" (Korean for "connect").
    await expect(
      page.locator('button').filter({ hasText: '연결' }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // MetaMask install link should be present
    await expect(page.getByRole('link', { name: 'MetaMask 설치하기' })).toBeVisible();

    // Helper text
    await expect(page.getByText('지갑을 연결하면 바로 로그인됩니다.')).toBeVisible();
  });

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    // Clear any existing cookies so we are definitely unauthenticated
    await page.context().clearCookies();

    await page.goto('/workspace');

    // Should end up on the login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByText('Notion Clone')).toBeVisible();
  });

  test('after authentication user is redirected to the workspace', async ({ page }) => {
    // Authenticate via the API directly (bypasses the wallet UI)
    await authenticateTestUser(page);

    // Now navigate — should stay on /workspace/... (not bounce to /login)
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/workspace\/[^/]+/, { timeout: 15_000 });

    // Sidebar should be present
    await expect(page.locator('aside')).toBeVisible();
  });

  test('authenticated user visiting /login is redirected to /workspace', async ({ page }) => {
    await authenticateTestUser(page);

    await page.goto('/login');
    // The login page auto-redirects authenticated users
    await expect(page).toHaveURL(/\/workspace/, { timeout: 15_000 });
  });
});
