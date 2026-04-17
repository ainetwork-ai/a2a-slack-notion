/**
 * Page permissions.
 *
 * Setup:
 *   - creator: workspace owner, creates a page.
 *   - viewer: different user, member of a DIFFERENT workspace (so they have no
 *     workspace-level access to the creator's page and no pagePermissions row either).
 *
 * Assertion:
 *   viewer's PATCH /api/blocks/:id on the creator's page returns 403.
 *
 * Why the viewer needs their own workspace: the API currently grants edit to any
 * workspace member when pagePermissions is absent (see slack/src/app/api/blocks/[id]/route.ts
 * `canEdit`). Putting them in a different workspace isolates them.
 */

import {
  buildSessionCookie,
  createTestUser,
  createTestWorkspace,
  deleteUser,
  deleteWorkspace,
  expect,
  test,
} from "./fixtures";

test.describe("Notion REST — permissions", () => {
  test("viewer without can_edit gets 403 on PATCH /api/blocks/:id", async ({ request, seed }) => {
    // Creator seeds workspace + page.
    const creatorCookie = await buildSessionCookie(seed.user.id);
    const creatorHeaders = { Cookie: `${creatorCookie.name}=${creatorCookie.value}` };

    const page = await (
      await request.post("/api/pages", {
        headers: creatorHeaders,
        data: { workspaceId: seed.workspace.id, title: "Private Page" },
      })
    ).json();

    const block = await (
      await request.post(`/api/pages/${page.id}/blocks`, {
        headers: creatorHeaders,
        data: { type: "text", content: { text: "secret content" } },
      })
    ).json();

    // Sanity: creator can PATCH.
    const creatorPatch = await request.patch(`/api/blocks/${block.id}`, {
      headers: creatorHeaders,
      data: { properties: { style: "paragraph" } },
    });
    expect(creatorPatch.status(), "creator PATCH must succeed").toBe(200);

    // Viewer: separate user + separate workspace → no pagePermissions + no membership overlap.
    const viewer = await createTestUser({ displayName: "Viewer E2E" });
    const viewerWorkspace = await createTestWorkspace(viewer.id);
    try {
      const viewerCookie = await buildSessionCookie(viewer.id);
      const viewerHeaders = { Cookie: `${viewerCookie.name}=${viewerCookie.value}` };

      const viewerPatch = await request.patch(`/api/blocks/${block.id}`, {
        headers: viewerHeaders,
        data: { properties: { style: "quote" } },
      });
      expect(viewerPatch.status()).toBe(403);

      // Block should be unchanged after the rejected PATCH.
      const after = await (
        await request.get(`/api/blocks/${block.id}`, { headers: creatorHeaders })
      ).json();
      expect((after.properties as { style?: string }).style).toBe("paragraph");
    } finally {
      await deleteWorkspace(viewerWorkspace.id);
      await deleteUser(viewer.id);
    }
  });

  test("unauthenticated PATCH returns 401", async ({ request, seed }) => {
    const creatorCookie = await buildSessionCookie(seed.user.id);
    const creatorHeaders = { Cookie: `${creatorCookie.name}=${creatorCookie.value}` };

    const page = await (
      await request.post("/api/pages", {
        headers: creatorHeaders,
        data: { workspaceId: seed.workspace.id, title: "Needs Auth" },
      })
    ).json();
    const block = await (
      await request.post(`/api/pages/${page.id}/blocks`, {
        headers: creatorHeaders,
        data: { type: "text", content: {} },
      })
    ).json();

    // No Cookie header — should get 401 from requireAuth.
    const res = await request.patch(`/api/blocks/${block.id}`, { data: { properties: {} } });
    expect(res.status()).toBe(401);
  });
});
