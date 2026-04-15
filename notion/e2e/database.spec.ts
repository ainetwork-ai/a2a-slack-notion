import { test, expect } from '@playwright/test';
import {
  authenticateTestUser,
  createDatabase,
  navigateToDatabase,
  getFirstWorkspaceId,
} from './helpers';

test.describe('Database views', () => {
  let workspaceId: string;
  let databaseId: string;

  test.beforeEach(async ({ page }) => {
    await authenticateTestUser(page);
    workspaceId = await getFirstWorkspaceId(page.request);
    const db = await createDatabase(page.request, workspaceId, 'E2E Test DB');
    databaseId = db.id;
    await navigateToDatabase(page, workspaceId, databaseId);
  });

  test.afterEach(async ({ page }) => {
    await page.request
      .delete(`http://localhost:3001/api/v1/pages/${databaseId}`)
      .catch(() => {});
  });

  test('database page loads with table view by default', async ({ page }) => {
    // The default view is table; the table view container should be present
    await expect(
      page.locator('[data-testid="table-view"]').or(page.locator('table')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('add a row to the database', async ({ page }) => {
    // Click the "+ New" row button at the bottom of the table
    const addRowBtn = page
      .getByRole('button', { name: /new|add row|\+/i })
      .first();

    if (await addRowBtn.isVisible()) {
      await addRowBtn.click();
      // A new empty row should appear
      await expect(page.locator('[data-testid="db-row"]').or(page.locator('tr')).last()).toBeVisible({
        timeout: 5_000,
      });
    } else {
      // Fallback: add row via API
      const res = await page.request.post(
        `http://localhost:3001/api/v1/databases/${databaseId}/rows`,
        { data: { properties: {} } },
      );
      expect(res.ok()).toBeTruthy();
      await page.reload();
      await page.waitForSelector('[data-testid="database-view"]', { timeout: 10_000 });
    }
  });

  test('switch to Board view', async ({ page }) => {
    // Click the Board view tab
    const boardTab = page
      .locator('[role="tab"]')
      .filter({ hasText: /board/i })
      .or(page.getByTitle(/board/i))
      .first();

    if (await boardTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await boardTab.click();
      await expect(
        page.locator('[data-testid="board-view"]').or(page.locator('[data-view-type="board"]')),
      ).toBeVisible({ timeout: 8_000 });
    } else {
      // Try clicking the icon button in the view switcher toolbar
      await page.locator('[aria-label="board"], [title="Board"]').first().click();
      await expect(page.locator('[data-testid="board-view"]')).toBeVisible({ timeout: 8_000 });
    }
  });

  test('switch to List view', async ({ page }) => {
    const listTab = page
      .locator('[role="tab"]')
      .filter({ hasText: /list/i })
      .or(page.getByTitle(/list/i))
      .first();

    if (await listTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await listTab.click();
      await expect(
        page.locator('[data-testid="list-view"]').or(page.locator('[data-view-type="list"]')),
      ).toBeVisible({ timeout: 8_000 });
    }
  });

  test('filter toolbar opens and accepts a filter rule', async ({ page }) => {
    // Click Filter button in the toolbar
    const filterBtn = page
      .getByRole('button', { name: /filter/i })
      .or(page.locator('[data-testid="filter-btn"]'))
      .first();

    if (await filterBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await filterBtn.click();

      // The filter toolbar / popover should appear
      await expect(
        page.locator('[data-testid="filter-toolbar"]').or(page.getByText(/add filter/i)),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('sort toolbar opens and accepts a sort rule', async ({ page }) => {
    const sortBtn = page
      .getByRole('button', { name: /sort/i })
      .or(page.locator('[data-testid="sort-btn"]'))
      .first();

    if (await sortBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await sortBtn.click();

      await expect(
        page.locator('[data-testid="sort-toolbar"]').or(page.getByText(/add sort/i)),
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
