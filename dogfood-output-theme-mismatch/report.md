# Dogfood Report: Notion Canvas iframe theme mismatch

| Field | Value |
|-------|-------|
| **Date** | 2026-04-17 |
| **App URL** | http://localhost:3004 |
| **Session** | notion-theme |
| **Scope** | Verify `/notion-embed/*` iframe renders `notion/apps/web` design verbatim, per spec "Render the existing `notion/apps/web` application inside the canvas panel verbatim — its own styling, its own extensions, its own bundle" |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **1** |

## Issues

### ISSUE-001: `/notion-embed/*` renders slack dark theme chrome, not notion/apps/web design

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Category** | visual / functional |
| **URL** | `http://localhost:3004/notion-embed/pages/<id>` (also the iframe src inside the Canvas panel) |
| **Repro Video** | N/A (static — visible on load) |

**Description**

Spec goal: "Render the existing `notion/apps/web` application inside the canvas panel verbatim — its own styling, its own extensions, its own bundle". The user expected to see notion/apps/web's full page chrome: left Sidebar (page tree), Breadcrumb, Icon picker + Cover image, Share panel, History panel, and notion's white background with notion prose styling.

Actual: the iframe mounts slack's partial port at `slack/src/components/notion/NotionPage`, which hard-codes slack dark theme tokens and strips all of notion/apps/web's chrome. The rendered DOM inside `/notion-embed/pages/<id>` is:

```html
<div class="flex flex-col h-full w-full bg-[#1a1d21]">       ← slack dark #1a1d21
  <div class="… border-b border-white/5 …">                   ← slack white/5 borders
    <button … class="… text-slate-400 hover:bg-white/5 …">    ← slack token
      <Minimize2 />
    </button>
  </div>
  <div class="flex-1 overflow-auto">
    <div class="max-w-[880…">    ← only editor body, no sidebar/breadcrumb/icon/cover/share/history
```

Compare with `notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx` which imports and composes `Sidebar`, `SharePanel`, `Breadcrumb`, `CollaborativeEditor`, `DatabaseView`, `HistoryPanel`, `SaveAsTemplateDialog` — none of which are mounted inside the iframe today.

The iframe infrastructure (F1–F8) works — it's same-origin, has proper `X-Frame-Options`/`CSP`, its registry keeps DOM identity across morph, and the security headers land correctly. The failure is that what's INSIDE the iframe is still the slack port, not the notion verbatim design. This makes the iframe architecture's primary selling point (CSS isolation + feature-for-feature parity with notion) moot: the user still sees slack chrome with slack dark colors, and none of notion's page-level features (sidebar navigation, icon/cover, share/history panels) are reachable.

Root cause: `slack/src/app/notion-embed/pages/[id]/page.tsx` line 1 — `import NotionPage from '@/components/notion/NotionPage';` — this is slack's port, not notion/apps/web. The prior F9 orchestrator added callout/columns/toggle *extensions* inside slack's editor, which fixed the slash-menu feature gap, but the page-level chrome & styling are still slack's.

**Repro Steps**

1. Open http://localhost:3004, sign in (Private key tab → any 32-byte hex).
   Screenshot: `screenshots/01-after-login.png`
2. Click `iframe-dogfood` channel in the sidebar. Channel loads.
   Screenshot: `screenshots/02-channel-opened.png`
3. Click the **Canvas** button in the right chrome. Canvas panel opens showing list + "New canvas" button.
   Screenshot: `screenshots/03-canvas-panel.png`
4. Click **New canvas**. A new canvas is created with a notion pageId; the iframe mounts at `/notion-embed/pages/4cace9d2-…`.
   Screenshot: `screenshots/04-canvas-opened.png`
5. Navigate the tab directly to `http://localhost:3004/notion-embed/pages/4cace9d2-…` to see the iframe body without slack's outer chrome distracting.
   Screenshot: `screenshots/05-notion-embed-direct.png`
6. Annotated evidence showing the slack-themed chrome (dark `#1a1d21` background, slate text tokens, no sidebar, no breadcrumb, no icon/cover, no share/history panels):
   Screenshot: `screenshots/06-theme-mismatch-evidence.png`
7. DOM snapshot: `document.querySelector('.notion-embed-root .h-screen').innerHTML` — shows `bg-[#1a1d21]` slack dark theme. This is slack's `NotionPage` chrome, not notion/apps/web's design.

**Expected**

The iframe body should look like notion/apps/web when opened at `/pages/<id>`: white background, left Sidebar with page tree + favorites, top Breadcrumb, page title with Icon + Cover image affordances, right-side Share/History buttons, and notion prose styling throughout. Hot/Cmd+P, page hover cards, and the full notion UX should be intact since it's mounted verbatim.

**Fix direction (proposed)**

Replace `slack/src/app/notion-embed/pages/[id]/page.tsx` so it actually renders notion/apps/web's page composition, not slack's `NotionPage`. Two options:

- **(A) Deep rsync** — copy `notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx` + Sidebar + Breadcrumb + SharePanel + HistoryPanel + workspace store + all their deps into `slack/src/app/notion-embed/` (keeping notion path aliases where the module tree lives self-contained). Adjust import paths and wire the same API endpoints.
- **(B) Live-source-mount** — configure slack's Next.js to compile the notion/apps/web app under `/notion-embed/*` using Next.js `transpilePackages` + webpack alias targeting `notion/apps/web/src`, so the source is shared rather than duplicated. Fastest and avoids drift.

Either way, the hard-coded slack dark chrome in `slack/src/components/notion/NotionPage.tsx` must be removed from the iframe render path. That slack component can stay as-is for non-iframe uses (if any), but `/notion-embed/*` must not route through it.

---

## Notes

- Iframe registry, view-transition morph, security headers, and the F9-ported callout/columns/toggle extensions all still work. This issue is isolated to the page-level layout/theme inside the iframe.
- Console is clean (no errors) on the `/notion-embed/pages/<id>` route — the visual regression is purely a composition/theme problem, not a runtime failure.
