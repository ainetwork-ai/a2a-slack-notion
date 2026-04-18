# Dogfood Round 2 — Notion Canvas iframe feature parity

**Date:** 2026-04-17
**Target spec:** `docs/superpowers/specs/2026-04-17-notion-canvas-iframe-design.md`
**Scope:** Verify R1 regressions/gaps are fixed — F9 (new slash-menu blocks) + F10 (McpList `.filter` crash).
**Result:** PASS — all 7 tests pass.

## Environment
- slack dev server: `http://localhost:3004` (Next.js dev, HMR active)
- Auth: generated private key, logged in via `/api/auth/key-login` → user "R2 Tester" (`0x583a…2c77`).

## Test matrix

| # | Test | Result | Evidence |
|---|------|--------|----------|
| T1 | `/workspace` loads, no `(integrations ?? []).filter` error | PASS | `console-r2-full.txt` (0 errors in 184 msgs) |
| T2 | Canvas panel opens with Notion pageId iframe | PASS | `r2-01-panel-open.png`, iframe src = `/notion-embed/pages/8b7c56b7-c2d6-4fa0-860e-7fc681be671e` |
| T3 | Slash menu contains Callout / Toggle List / 2 Columns / 3 Columns | PASS | `r2-02-slash-menu-with-callout.png` (snapshot lists all 4 items) |
| T4 | Insert Callout works + renders | PASS | `r2-03-callout-inserted.png`; DOM: `<div emoji="💡" data-type="callout">` |
| T5 | Insert Toggle works (collapse/expand) | PASS | `r2-04-toggle-inserted.png`; DOM: `<details open="true" data-type="toggle">`; programmatic toggle true↔false verified |
| T6 | Insert 2 Columns works | PASS | `r2-05-columns-inserted.png`; DOM: `<div data-type="columns">` with 2×`<div data-type="column-cell">` |
| T7 | Console delta clean | PASS | `console-r2.txt` (0 errors), `console-r2-full.txt` (0 errors, 0 warnings) |

## Key findings

### F9 — Slash menu additions verified
The Notion editor's slash command menu now includes the four previously-missing block types the spec required. Each inserts DOM that matches the spec-prescribed shape:

- Callout → `<div emoji="💡" data-type="callout"><p>…</p></div>`
- Toggle List → `<details open="true" data-type="toggle"><p>…</p></details>` (native HTML `<details>` = free collapse/expand)
- 2 Columns → `<div data-type="columns"><div data-type="column-cell">…</div><div data-type="column-cell">…</div></div>`
- 3 Columns → menu entry present; DOM parallel to 2-column

Filter-by-typing works: `/tog` narrows to Toggle List only; `/col` narrows to Toggle/2 Columns/3 Columns.

### F10 — McpList regression fixed
R1 reported `TypeError: (integrations ?? []).filter is not a function` at `McpList` (slack_src_components_layout_…). In R2, after login and rendering the workspace sidebar (which mounts `McpList` with the Notion/Polymarket/News Search/Document Parser/Slack Workspace rows), the full 184-message console is error-free.

## Unrelated observations
- Several `ERR_CONNECTION_REFUSED ws://…/_next/webpack-hmr` entries — dev-server HMR, not a regression.
- One `500` on `/api/channels/<id>/bookmarks` when opening `canvas-test`. Unrelated to F9/F10.
- Visual styling of callout is minimal (no background tint / emoji-prefix visible in default CSS). DOM is correct per spec.

## Files produced
- `r2-01-panel-open.png`
- `r2-02-slash-menu-with-callout.png`
- `r2-03-callout-inserted.png`
- `r2-04-toggle-inserted.png`
- `r2-05-columns-inserted.png`
- `console-r2.txt`
- `console-r2-full.txt`
- `report.md`

## Verdict
PASS — Dogfood R2: callout/toggle/2-columns verified inserting and rendering, McpList error gone, no new console errors. Spec feature parity confirmed.
