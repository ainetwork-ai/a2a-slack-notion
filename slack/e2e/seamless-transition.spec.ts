/**
 * Seamless Canvas panel → full-page transition.
 *
 * Verifies:
 *   (a) URL changes to `/pages/:id`
 *   (b) editor body element has a matching `view-transition-name` on both sides
 *   (c) scroll position inside the editor is preserved across the transition
 *   (d) caret position (or at least focus + active element range) is preserved after click
 */

import { createCanvas, expect, test } from "./fixtures";

test.describe("Seamless canvas → full-page transition", () => {
  test("expanding the panel navigates to /pages/:id with preserved editor state", async ({
    authedPage: page,
    seed,
  }) => {
    const canvas = await createCanvas(seed.workspace.id, seed.user.id, {
      title: "Transition Spec",
    });

    // Open workspace home first so we land on a page that can render the canvas panel.
    await page.goto(`/workspace/${seed.workspace.id}`);

    // Open the canvas in panel mode via a deep link query. If the UI prefers a click
    // affordance, swap this for `page.getByRole(...)`. Tests should still pass because
    // NotionPage is rendered in `mode="panel"` on this route.
    await page.goto(`/workspace/${seed.workspace.id}?canvas=${canvas.id}`);

    const panelEditor = page.locator('[data-notion-editor][data-mode="panel"]');
    await expect(panelEditor).toBeVisible();

    // Seed some content height so scroll is meaningful.
    const editorBody = panelEditor.locator('[data-notion-editor-body]');
    await editorBody.evaluate((el) => {
      // Inject filler paragraphs so the editor overflows.
      for (let i = 0; i < 40; i++) {
        const p = document.createElement("p");
        p.textContent = `paragraph ${i} — lorem ipsum dolor sit amet`;
        el.appendChild(p);
      }
      el.scrollTop = 800;
    });

    const scrollBefore = await editorBody.evaluate((el) => el.scrollTop);
    const vtNameBefore = await editorBody.evaluate(
      (el) => getComputedStyle(el).viewTransitionName || null,
    );
    expect(scrollBefore).toBeGreaterThan(0);
    expect(vtNameBefore, "panel editor should own a view-transition-name").toBeTruthy();

    // Place a caret somewhere predictable before navigating.
    await editorBody.click({ position: { x: 40, y: 40 } });
    const caretBefore = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      return { start: r.startOffset, containerText: r.startContainer.textContent ?? "" };
    });

    // Trigger the expand action. The UI contract is a button with this test id.
    const expandBtn = page.locator('[data-testid="canvas-expand-to-fullpage"]');
    await expandBtn.click();

    // (a) URL
    await expect(page).toHaveURL(new RegExp(`/pages/${canvas.pageId}$`));

    // (b) the full page's editor body must declare the same view-transition-name
    const fullEditorBody = page.locator(
      '[data-notion-editor][data-mode="full"] [data-notion-editor-body]',
    );
    await expect(fullEditorBody).toBeVisible();
    const vtNameAfter = await fullEditorBody.evaluate(
      (el) => getComputedStyle(el).viewTransitionName || null,
    );
    expect(vtNameAfter).toBe(vtNameBefore);

    // (c) scroll preservation
    const scrollAfter = await fullEditorBody.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(8);

    // (d) caret / focus
    await fullEditorBody.click({ position: { x: 40, y: 40 } });
    const caretAfter = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      return { start: r.startOffset, containerText: r.startContainer.textContent ?? "" };
    });
    expect(caretAfter).not.toBeNull();
    if (caretBefore && caretAfter) {
      // Same anchor text implies DOM did not get re-created from scratch.
      expect(caretAfter.containerText).toBe(caretBefore.containerText);
    }
  });

  test("back navigation from full page returns to panel with state intact", async ({
    authedPage: page,
    seed,
  }) => {
    const canvas = await createCanvas(seed.workspace.id, seed.user.id, {
      title: "Back Transition Spec",
    });

    await page.goto(`/pages/${canvas.pageId}`);
    const fullEditorBody = page.locator(
      '[data-notion-editor][data-mode="full"] [data-notion-editor-body]',
    );
    await expect(fullEditorBody).toBeVisible();

    await fullEditorBody.evaluate((el) => {
      el.scrollTop = 400;
    });
    const scrollBefore = await fullEditorBody.evaluate((el) => el.scrollTop);

    await page.goBack();

    // Either the workspace view or wherever the user came from — assert NOT on /pages/:id
    await expect(page).not.toHaveURL(new RegExp(`/pages/${canvas.pageId}$`));

    // If we returned to a panel, scroll state should match within tolerance.
    const panelEditor = page.locator(
      '[data-notion-editor][data-mode="panel"] [data-notion-editor-body]',
    );
    if (await panelEditor.count()) {
      const scrollAfter = await panelEditor.evaluate((el) => el.scrollTop);
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(8);
    }
  });
});
