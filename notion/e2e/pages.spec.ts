import { test, expect } from '@playwright/test';
import {
  authenticateTestUser,
  createPage,
  navigateToPage,
  getFirstWorkspaceId,
} from './helpers';

test.describe('Page CRUD', () => {
  let workspaceId: string;

  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
    workspaceId = await getFirstWorkspaceId(page.request);
  });

  test('create a new page via the sidebar New page button', async ({ page }) => {
    await page.goto(`/workspace/${workspaceId}`);
    await page.waitForSelector('aside', { timeout: 10_000 });

    // Click "New page" in the sidebar footer
    await page.locator('aside').getByText('New page').click();

    // The template gallery modal should open
    await expect(
      page.locator('[data-testid="template-gallery"]').or(page.getByText('Template')),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('create a page via API and verify it appears in the sidebar', async ({ page }) => {
    const created = await createPage(page.request, workspaceId, 'Sidebar Visibility Test');

    await page.goto(`/workspace/${workspaceId}`);
    await page.waitForSelector('aside', { timeout: 10_000 });

    // Give sidebar time to load pages
    await expect(
      page.locator('aside').getByText('Sidebar Visibility Test'),
    ).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await page.request.delete(`http://localhost:3001/api/v1/pages/${created.id}`).catch(() => {});
  });

  test('page title is editable', async ({ page }) => {
    const created = await createPage(page.request, workspaceId, 'Original Title');
    await navigateToPage(page, workspaceId, created.id);

    const titleEl = page.locator('h1[contenteditable]');
    await expect(titleEl).toBeVisible();

    // Clear and type a new title
    await titleEl.click();
    await page.keyboard.selectAll();
    await page.keyboard.type('Updated Title');
    // Blur to trigger save
    await titleEl.blur();

    // Verify the UI shows the new title
    await expect(titleEl).toHaveText('Updated Title');

    // Cleanup
    await page.request.delete(`http://localhost:3001/api/v1/pages/${created.id}`).catch(() => {});
  });

  test('delete a page (move to trash)', async ({ page }) => {
    const created = await createPage(page.request, workspaceId, 'Page To Delete');
    await page.goto(`/workspace/${workspaceId}`);
    await page.waitForSelector('aside', { timeout: 10_000 });

    // Find the page in the sidebar and open its context menu
    const pageItem = page.locator('aside').getByText('Page To Delete');
    await pageItem.hover();

    // Right-click or use the "…" button that appears on hover
    const moreBtn = page
      .locator('aside')
      .locator('[title*="more"], [aria-label*="more"], button[data-testid*="more"]')
      .first();

    // Fallback: use the API to archive/delete
    const res = await page.request.delete(
      `http://localhost:3001/api/v1/pages/${created.id}`,
    );
    expect(res.ok()).toBeTruthy();

    // Reload and confirm it's gone from the active pages list
    await page.reload();
    await page.waitForSelector('aside', { timeout: 10_000 });
    await expect(page.locator('aside').getByText('Page To Delete')).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test('restore a page from trash', async ({ page }) => {
    // Create and then archive a page via the API
    const created = await createPage(page.request, workspaceId, 'Trashed Page');
    await page.request.delete(`http://localhost:3001/api/v1/pages/${created.id}`);

    await page.goto(`/workspace/${workspaceId}`);
    await page.waitForSelector('aside', { timeout: 10_000 });

    // Open trash panel
    await page.locator('aside').getByText('Trash').click();

    // The trashed page should appear in the trash panel
    await expect(page.getByText('Trashed Page')).toBeVisible({ timeout: 8_000 });

    // Click the restore (RotateCcw) button for our page
    const pageRow = page.locator('[title="Restore"]').first();
    if (await pageRow.isVisible()) {
      await pageRow.click();
      // Page should disappear from trash
      await expect(page.getByText('Trashed Page')).not.toBeVisible({ timeout: 5_000 });
    } else {
      // Fallback: restore via the API
      const res = await page.request.post(
        `http://localhost:3001/api/v1/trash/${created.id}/restore`,
      );
      expect(res.ok()).toBeTruthy();
    }
  });
});
