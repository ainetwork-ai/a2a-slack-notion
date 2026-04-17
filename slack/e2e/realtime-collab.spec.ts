/**
 * Realtime collaboration via Hocuspocus — SKELETON ONLY.
 *
 * This file sketches the two-client topology we want to test against the
 * running Hocuspocus provider, but all tests are marked `test.fixme()` until:
 *   1. The hocuspocus server process is started alongside `pnpm dev`
 *      (currently requires `pnpm hocuspocus` in a separate terminal).
 *   2. A harness hook in playwright.config.ts brings that process up/down.
 *
 * When ready, flip each `test.fixme` to `test` and implement the TODOs.
 */

import { expect, test } from "./fixtures";

test.describe("Hocuspocus realtime collab (skeleton)", () => {
  test.fixme("two clients on the same page see each other's edits", async ({
    browser,
    seed,
  }) => {
    // TODO: requires real Hocuspocus server. Blocked on harness wiring.
    // Shape of the test once unblocked:
    //
    //   const contextA = await browser.newContext();
    //   const contextB = await browser.newContext();
    //   await loginAs(contextA, seed.user);
    //   await loginAs(contextB, seed.user); // or a second user with can_edit
    //
    //   const canvas = await createCanvas(seed.workspace.id, seed.user.id);
    //
    //   const pageA = await contextA.newPage();
    //   const pageB = await contextB.newPage();
    //   await pageA.goto(`/pages/${canvas.pageId}`);
    //   await pageB.goto(`/pages/${canvas.pageId}`);
    //
    //   const editorA = pageA.locator('[data-notion-editor-body]').first();
    //   const editorB = pageB.locator('[data-notion-editor-body]').first();
    //   await editorA.click();
    //   await editorA.type("hello from A");
    //
    //   await expect(editorB).toContainText("hello from A", { timeout: 5_000 });
    //
    //   await contextA.close();
    //   await contextB.close();
    expect(true).toBe(true); // placeholder to keep the fixme body non-empty
  });

  test.fixme("cursor awareness — presence indicator appears for the second client", async ({
    browser,
    seed,
  }) => {
    // TODO: assert that contextA sees a collaboration-cursor caret labeled with
    // contextB's displayName once B focuses the editor.
    expect(true).toBe(true);
  });

  test.fixme("conflict resolution — concurrent edits converge via Yjs", async ({
    browser,
    seed,
  }) => {
    // TODO: two clients each insert a block at the same anchor; after settle,
    // both clients' block trees should be identical and contain both inserts.
    expect(true).toBe(true);
  });
});
