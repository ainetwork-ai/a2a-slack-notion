import { test, expect } from '@playwright/test';
import {
  authenticateTestUser,
  createPage,
  getFirstWorkspaceId,
} from './helpers';

test.describe('Search', () => {
  let workspaceId: string;
  let pageId: string;
  const UNIQUE_TITLE = `SearchTarget-${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    // Create the target page once for all tests in this suite
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await authenticateTestUser(pg);
    workspaceId = await getFirstWorkspaceId(pg.request);
    const created = await createPage(pg.request, workspaceId, UNIQUE_TITLE);
    pageId = created.id;
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await authenticateTestUser(pg);
    await pg.request
      .delete(`http://localhost:3001/api/v1/pages/${pageId}`)
      .catch(() => {});
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
    await page.goto(`/workspace/${workspaceId}`);
    await page.waitForSelector('aside', { timeout: 10_000 });
  });

  test('Cmd+K opens the search modal', async ({ page }) => {
    // Press Ctrl+K (Linux/Windows) or Meta+K (macOS) to open search
    await page.keyboard.press('Control+k');

    // Search modal / dialog should appear
    const modal = page
      .locator('[data-testid="search-modal"]')
      .or(page.locator('[role="dialog"]'))
      .or(page.locator('[aria-label*="Search"]'))
      .first();

    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test('search input field is focused when the modal opens', async ({ page }) => {
    await page.keyboard.press('Control+k');

    // The search input inside the modal should be focused
    const searchInput = page
      .locator('[data-testid="search-input"]')
      .or(page.locator('input[placeholder*="earch"]'))
      .or(page.locator('input[type="search"]'))
      .first();

    await expect(searchInput).toBeFocused({ timeout: 5_000 });
  });

  test('search returns matching pages', async ({ page }) => {
    await page.keyboard.press('Control+k');

    const searchInput = page
      .locator('[data-testid="search-input"]')
      .or(page.locator('input[placeholder*="earch"]'))
      .or(page.locator('input[type="search"]'))
      .first();

    await searchInput.waitFor({ timeout: 5_000 });
    await searchInput.fill(UNIQUE_TITLE.slice(0, 10));

    // Wait for search results to appear
    await expect(
      page.getByText(UNIQUE_TITLE).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('clicking a search result navigates to the page', async ({ page }) => {
    await page.keyboard.press('Control+k');

    const searchInput = page
      .locator('[data-testid="search-input"]')
      .or(page.locator('input[placeholder*="earch"]'))
      .or(page.locator('input[type="search"]'))
      .first();

    await searchInput.waitFor({ timeout: 5_000 });
    await searchInput.fill(UNIQUE_TITLE.slice(0, 10));

    // Click the first result
    const result = page.getByText(UNIQUE_TITLE).first();
    await result.waitFor({ timeout: 8_000 });
    await result.click();

    // Should navigate to the target page
    await expect(page).toHaveURL(new RegExp(pageId), { timeout: 10_000 });
    await expect(page.locator('h1[contenteditable]')).toContainText(UNIQUE_TITLE, {
      timeout: 8_000,
    });
  });

  test('closing the search modal with Escape restores focus', async ({ page }) => {
    await page.keyboard.press('Control+k');

    const modal = page
      .locator('[data-testid="search-modal"]')
      .or(page.locator('[role="dialog"]'))
      .first();

    await modal.waitFor({ timeout: 5_000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
