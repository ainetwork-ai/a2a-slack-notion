# Notion Canvas — iframe-mounted subroute with persistent View Transitions

**Date:** 2026-04-17
**Status:** Approved (brainstorming)
**Supersedes partially:** INTEGRATION.md #4 ("no iframes") — relaxed to *same-origin subroute iframe inside the canvas panel*. Cross-origin / cross-subdomain iframes remain forbidden.

## Problem

The current Slack Canvas ↔ Notion integration (INTEGRATION.md P3 pending) is visibly broken:

- **(b) Invisible text.** Slack's dark theme leaks onto the ported Notion editor; tokens and prose styles are missing, so text contrast is destroyed.
- **(c) Missing features.** Only ~11 of ~30 editor files were ported into `slack/src/components/notion/editor/`. Callout, columns, toggle, comments, block-context-menu, block-drag-overlay, block-handle, and related extensions are absent.

Finishing the port (Approach B in brainstorming) is ~2–3 days of mechanical work with ongoing CSS-collision fallout. User wants a one-shot fix that also preserves the seamless panel↔full View Transition.

## Goal

Render the existing `notion/apps/web` application inside the canvas panel verbatim — its own styling, its own extensions, its own bundle — without breaking the panel↔full morph animation or cutting the Y.js collaboration session.

## Solution (Approach A, locked)

Mount the Notion app as a same-origin subroute `/notion-embed/*` inside the slack Next.js binary, and embed it via an iframe whose DOM node is persistent across panel↔full route transitions.

### Architecture

```
slack/src/
├─ app/
│  ├─ notion-embed/
│  │  ├─ layout.tsx              # rsync from notion/apps/web/src/app/(app)/layout.tsx
│  │  ├─ pages/[id]/page.tsx     # rsync from notion/apps/web
│  │  └─ globals-notion.css      # rsync from notion/apps/web/src/app/globals.css
│  └─ pages/[id]/page.tsx        # existing slack full-page route; swap body to NotionCanvasFrame
│
├─ components/canvas/
│  ├─ CanvasEditor.tsx           # canvas.pageId branch → NotionCanvasFrame (replaces NotionPage)
│  └─ NotionCanvasFrame.tsx      # [NEW] persistent-iframe wrapper
│
└─ lib/notion/
   └─ notion-iframe-registry.ts  # [NEW] pageId → iframe DOM node singleton
```

### Key techniques

1. **Portal-to-body persistent iframe.** Each `pageId` gets one `<iframe>` node appended to `document.body` and reused across route changes. React components only render a placeholder `<div>`; the registry syncs iframe position/size to that placeholder via `ResizeObserver` + scroll listeners.
2. **Shared view-transition-name.** Both panel placeholder and full-page placeholder apply `view-transition-name: notion-frame-${pageId}`. The browser treats them as the same element across the route transition and morphs the captured snapshot.
3. **Same-origin = zero integration surface.** Session cookies (`slack-a2a-session`), Hocuspocus WS (`/collab`), and REST APIs (`/api/pages`, `/api/blocks`) all flow transparently because the iframe shares origin with the parent.

### Components / modules

**`notion-iframe-registry.ts`** — singleton

```
acquire(pageId)               → HTMLIFrameElement   (create if missing, append to body, refCount++)
release(pageId)               → void                (refCount--; at 0 set visibility:hidden, keep node)
bindPlaceholder(pageId, el, vtName)
                              → cleanup()           (ResizeObserver tracks el; iframe position:fixed
                                                     syncs to el's getBoundingClientRect; iframe
                                                     style.viewTransitionName = vtName)
```

**`NotionCanvasFrame.tsx`** — React wrapper

- Props: `pageId`, `mode: 'panel' | 'full'`, `onExpand?`, `onCollapse?`
- Renders a placeholder `<div>` whose bounding box is what the registry tracks.
- Unified VT name: `notion-frame-${pageId}` (same string in both modes — required for morph).
- Calls `registry.acquire` on mount, `registry.release` on unmount.

**`CanvasEditor.tsx`** — changes

- L878-882 (current `canvas.pageId` branch): replace `<NotionPage pageId={...} mode="panel" />` with `<NotionCanvasFrame pageId={canvas.pageId} mode="panel" onExpand={handleExpand} />`.
- Add `handleExpand = () => seamlessNavigate(() => router.push(`/pages/${canvas.pageId}`))`.
- Keep markdown fallback intact for the `!canvas.pageId` branch and for the iframe-load-failure path.

**`/notion-embed/*` routes** (new)

- `layout.tsx`: minimal — does **not** include slack's `ThemeProvider`, `Web3Provider`, or workspace chrome. Notion's own providers only.
- `globals-notion.css`: copied verbatim from `notion/apps/web/src/app/globals.css`. Because this route renders inside an iframe document, its CSS is fully scoped from the parent slack document automatically.
- `pages/[id]/page.tsx`: copied from `notion/apps/web`. Auth guard reuses iron-session `slack-a2a-session` cookie validation (identical to existing Hocuspocus auth path).

### Data flow

```
slack.example.com (parent)
 ├─ CanvasEditor (panel mode)
 │    └─ NotionCanvasFrame → registry.acquire → iframe@body
 │                                                   │
 │                                                   └─ src="/notion-embed/pages/${id}"
 │                                                      ├─ cookie: slack-a2a-session (auto, same-origin)
 │                                                      ├─ WS: wss://.../collab (Hocuspocus, iron-session auth)
 │                                                      └─ fetch: /api/pages/*, /api/blocks/* (same-origin)
 │
 └─ On expand: startViewTransition(() => router.push(`/pages/${id}`))
       ├─ CanvasEditor unmounts → registry.release (refCount 1→0 on panel side)
       │   ...then /pages/[id]/page.tsx mounts → NotionCanvasFrame (full mode)
       │   → registry.acquire (refCount 0→1) returns the same iframe node
       │   → placeholder bounding box is now full-screen → iframe follows
       ├─ Browser morphs old snapshot (panel box) → new snapshot (full box)
       └─ Y.js / scroll / cursor / selection fully preserved (iframe never reloaded)
```

### parent ↔ iframe communication

| Need | Mechanism |
|---|---|
| Expand / collapse button | Parent CanvasEditor / page chrome. Buttons live outside iframe. |
| Title changes → sidebar | Existing REST (`PATCH /api/pages/:id`) + parent's existing refresh mechanism. |
| Pipeline status stepper | Parent only. Iframe body does not own stepper. |
| Realtime collaboration | Hocuspocus WS — parent not involved. |

**No postMessage channel required.** All cross-boundary coordination happens via REST / WS / cookies.

### Security / auth

- `sandbox` attribute: **not applied** (iframe needs clipboard, DnD, file uploads, window.open, forms).
- `X-Frame-Options: SAMEORIGIN` on the `/notion-embed/*` route (Next.js config).
- `Content-Security-Policy: frame-ancestors 'self'` for defense in depth.
- CSRF: unchanged — iframe calls same-origin APIs that already enforce existing CSRF controls.
- Auth: unchanged — iron-session cookie is same-origin and the Hocuspocus server already validates it.

### Error handling / edge cases

| Scenario | Handling |
|---|---|
| `/notion-embed/pages/:id` returns 404/500 | 5-second `load` timeout → registry destroys that iframe, CanvasEditor shows "Editor failed to load — open in markdown mode" with fallback button. |
| `pageId` exists but block tree empty | Notion app's native "empty page + first block" flow renders inside iframe. No parent involvement. |
| View Transition while another is in flight | `seamlessNavigate` guards against concurrent `startViewTransition`; re-entrant calls skip the prior transition. |
| Same `pageId` placeholder mounted twice (multi-tab etc.) | refCount > 1; iframe follows the most recently bound placeholder. Other placeholders show empty box. Minimal implementation. |
| First paint gap | 200 ms skeleton in placeholder, iframe becomes visible on first `load` event. |
| `startViewTransition` unsupported (older Safari) | Existing `seamlessNavigate` falls back to direct callback execution. Iframe jumps to new position; animation is skipped; functionality intact. |
| Hocuspocus WS disconnect | Tiptap collaboration extension retries inside iframe. Parent uninvolved. |
| Browser refresh | Registry singleton resets; iframe recreated; server replays last Y.js snapshot via existing flow. |
| Navigate away from `/pages/:id` | NotionCanvasFrame unmounts → `release`. refCount 0 leaves iframe at `visibility:hidden` (no destroy) to keep re-entry instant. No TTL in v1. |

### Preserving markdown fallback

The `!canvas.pageId` branch (legacy canvases without a page) keeps its existing markdown textarea + `CanvasMarkdown` preview intact. Additionally, the iframe-load-failure path surfaces a "Switch to markdown" action that forces the legacy branch for that session.

## Test plan

### Unit (vitest)

`notion-iframe-registry.test.ts`:
- `acquire` creates iframe, appends to body, sets src.
- Double `acquire` with same pageId returns identical DOM node; refCount=2.
- `release` to refCount=0 hides iframe but keeps DOM node.
- `bindPlaceholder` assigns `view-transition-name` and wires a ResizeObserver.

### E2E (Playwright, `slack/e2e/notion-canvas.spec.ts`)

1. Panel basics: canvas opens → iframe loads → `/` triggers slash menu → typed text has visible prose styling (screenshot diff for (b)).
2. Panel → full transition: expand click → URL change, `startViewTransition` called, iframe DOM identity preserved (`page.evaluate` comparing `iframe.dataset.registryId`), scroll and cursor retained.
3. Full → panel collapse: reverse morph; WS `close` event never fires.
4. Reduced motion: `emulateMedia({ reducedMotion: 'reduce' })` → animation skipped, final state instant.
5. Iframe load failure: `/notion-embed/pages/bogus` → 5 s timeout → fallback UI + markdown button.
6. Auth: logged-out request to `/notion-embed/pages/:id` → redirect or 401.

### Manual checklist (post-build)

- [ ] Callout, columns, toggle, comment, drag handle all function inside panel.
- [ ] Notion's white-background design is legible inside slack dark panel.
- [ ] Realtime sync across two tabs.
- [ ] Direct bookmark entry to `/pages/:id` works.
- [ ] No reduced-motion flicker on panel↔full.

## Non-goals

- Rewriting `notion/apps/web` or removing it from the monorepo.
- Eliminating iframe for other non-canvas surfaces.
- Persistent cross-session iframe reuse (v1 destroys on full page refresh; revisit if idle cost matters).
- postMessage bridge (unneeded given same-origin + server-side state).

## Risks

1. **Double bundle weight.** `/notion-embed/*` ships Tiptap, Yjs, Hocuspocus client, prose styles in addition to the slack bundle. Mitigation: Next.js per-route code splitting already scopes this; parent slack routes do not import notion-embed modules.
2. **Initial paint +~200 ms.** Accepted tradeoff — iframe caches on first load; subsequent canvas opens for the same pageId are instant via registry.
3. **View Transition + iframe snapshot.** Browser captures the iframe as a bitmap during the morph; if capture fails on some engines, animation degrades to crossfade. Acceptable fallback.
4. **Parallel/intercepted routes in Next 16.** Spec does not rely on them — registry lives entirely in client-side DOM, so the approach works regardless of app-router maturity.

## Open items

- Confirm whether `/pages/[id]/page.tsx` currently exists in slack; if so, refactor in place. If not, create.
- Decide TTL / idle eviction for registry (v1: none; revisit after dogfooding).
