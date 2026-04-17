/**
 * Block CRUD via REST — exercises the endpoints the Notion agents/webhooks use.
 *
 * Covers:
 *   - POST   /api/pages                 → create page (root block of type='page')
 *   - POST   /api/pages/:id/blocks      → append a text block
 *   - PATCH  /api/blocks/:id            → update properties
 *   - DELETE /api/blocks/:id            → remove + cascade from parent childrenOrder
 *   - GET    /api/pages/:id             → verify final tree shape
 */

import { buildSessionCookie, expect, test } from "./fixtures";

test.describe("Notion REST — blocks CRUD", () => {
  test("create page, append/update/delete blocks, verify tree", async ({ request, seed }) => {
    const cookie = await buildSessionCookie(seed.user.id, { ainAddress: seed.user.ainAddress });
    const headers = { Cookie: `${cookie.name}=${cookie.value}` };

    // 1. POST /api/pages
    const createPageRes = await request.post("/api/pages", {
      headers,
      data: { workspaceId: seed.workspace.id, title: "REST CRUD Page" },
    });
    expect(createPageRes.status(), await createPageRes.text()).toBe(201);
    const pageBody = await createPageRes.json();
    expect(pageBody.id).toBeTruthy();
    expect(pageBody.type).toBe("page");
    expect((pageBody.properties as { title?: string }).title).toBe("REST CRUD Page");
    const pageId: string = pageBody.id;

    // 2. POST /api/pages/:id/blocks — append a text block
    const appendRes = await request.post(`/api/pages/${pageId}/blocks`, {
      headers,
      data: {
        type: "text",
        content: { text: "hello world" },
        properties: { style: "paragraph" },
      },
    });
    expect(appendRes.status(), await appendRes.text()).toBe(201);
    const appendedBlock = await appendRes.json();
    expect(appendedBlock.type).toBe("text");
    expect(appendedBlock.pageId).toBe(pageId);
    const blockId: string = appendedBlock.id;

    // 3. Append a second block so we can verify ordering / cascade semantics on delete
    const appendRes2 = await request.post(`/api/pages/${pageId}/blocks`, {
      headers,
      data: { type: "heading_1", content: { text: "a heading" } },
    });
    expect(appendRes2.status()).toBe(201);
    const appendedBlock2 = await appendRes2.json();
    const blockId2: string = appendedBlock2.id;

    // 4. PATCH /api/blocks/:id — update properties of first block
    const patchRes = await request.patch(`/api/blocks/${blockId}`, {
      headers,
      data: { properties: { style: "quote", color: "blue" } },
    });
    expect(patchRes.status(), await patchRes.text()).toBe(200);
    const patched = await patchRes.json();
    expect((patched.properties as { style?: string }).style).toBe("quote");
    expect((patched.properties as { color?: string }).color).toBe("blue");

    // 5. GET /api/pages/:id — verify both blocks present with correct ordering
    const treeRes = await request.get(`/api/pages/${pageId}`, { headers });
    expect(treeRes.status()).toBe(200);
    const tree = await treeRes.json();
    expect(tree.page.id).toBe(pageId);
    const childIds = tree.page.childrenOrder as string[];
    expect(childIds).toEqual([blockId, blockId2]);
    expect(tree.blocks).toHaveLength(3); // page + 2 children

    // 6. DELETE /api/blocks/:id — remove first block
    const deleteRes = await request.delete(`/api/blocks/${blockId}`, { headers });
    expect(deleteRes.status()).toBe(200);
    const deletedBody = await deleteRes.json();
    expect(deletedBody.success).toBe(true);

    // 7. GET /api/pages/:id — verify childrenOrder updated + first block gone
    const finalTree = await (await request.get(`/api/pages/${pageId}`, { headers })).json();
    const finalChildren = finalTree.page.childrenOrder as string[];
    expect(finalChildren).toEqual([blockId2]);
    expect(finalTree.blocks.map((b: { id: string }) => b.id)).not.toContain(blockId);
  });

  test("POST /api/pages rejects missing workspaceId with 400", async ({ request, seed }) => {
    const cookie = await buildSessionCookie(seed.user.id);
    const res = await request.post("/api/pages", {
      headers: { Cookie: `${cookie.name}=${cookie.value}` },
      data: { title: "No Workspace" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/pages/:id/blocks rejects invalid block type with 400", async ({ request, seed }) => {
    const cookie = await buildSessionCookie(seed.user.id);
    const headers = { Cookie: `${cookie.name}=${cookie.value}` };
    const created = await (
      await request.post("/api/pages", {
        headers,
        data: { workspaceId: seed.workspace.id, title: "Type Check" },
      })
    ).json();

    const res = await request.post(`/api/pages/${created.id}/blocks`, {
      headers,
      data: { type: "not_a_real_type", content: {} },
    });
    expect(res.status()).toBe(400);
  });
});
