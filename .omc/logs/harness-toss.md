# Harness Toss Log

---

## 새 사이클 시작: Notion Canvas iframe-mounted subroute (2026-04-17)

대상 spec: `docs/superpowers/specs/2026-04-17-notion-canvas-iframe-design.md`
EVAL_CRITERIA: 스펙이 요구한 노션 기능들(callout/columns/toggle/comment/drag-handle, 패널↔풀 morph, iframe DOM 식별 유지, Y.js WS 보존, 흰 배경 가독성, 5초 로드 타임아웃 + markdown 폴백, /pages/[id] 직접 진입)이 dogfooding 단계에서 실제 동작 + slack workspace `npm run build` 통과.

피처 분해:
- F1 iframe registry · F2 NotionCanvasFrame · F3 /notion-embed/* 서브라우트 · F4 CanvasEditor 패널 + handleExpand · F5 /pages/[id] 풀모드 · F6 보안 헤더 · F7 markdown 폴백 · F8 빌드 그린

(이하 Orchestrator 사이클 로그는 가장 최신 항목이 파일 끝에 append)

---

## 이전 사이클 (Canvas/Notion 복구) — 2026-04-17 PASS 완료, 아카이브 below.

---

## 새 사이클 시작: Canvas/Notion 복구 (2026-04-17)

대상: `dogfood-output/report.md` 의 ISSUE-001 / ISSUE-002 / ISSUE-003 해결
EVAL_CRITERIA: 3종 이슈 해결 + `/dogfood` 실사용 재검증 통과

(이하 신규 Orchestrator 사이클 로그는 가장 최신 항목이 파일 끝에 append 된다)

---

# Harness Toss Log — Inline Comment Agent Revision

## [Task 1] 2026-04-16

### Error
1. TypeScript TS2322: `getCommentHighlightRange` returned `{ from, to, text } | null` instead of `boolean`, violating Tiptap's `Partial<RawCommands>` constraint.
2. TypeScript TS7031/TS7006: Implicit `any` types on `state`, `node`, `pos`, `mark` parameters in `getCommentHighlightRange`.
3. Tests failed: `no window object available` — vitest root config uses `environment: 'node'` but Tiptap Editor requires DOM (jsdom).

### Fix
1. Extracted `findCommentHighlightRange()` as a standalone exported helper function. Made `getCommentHighlightRange` command return `boolean` (stores result in `addStorage().lastRange`). Updated callers in `use-comment-agent.ts` and `collaborative-editor.tsx` to use `findCommentHighlightRange(editor.state.doc, id)`.
2. Added explicit `ProseMirrorNode` and `number` type annotations to all `doc.descendants` callback params.
3. Added `@vitest-environment jsdom` docblock to test file; installed `jsdom` as workspace devDependency.

## [Task 2 — feat-2: MCP Server Refactor] 2026-04-16

### Summary
Split 535-line monolith `index.ts` into 4 files (tools.ts 519L, a2a.ts 133L, http.ts 49L, index.ts 133L = 834L total). Added 5 new tools (list_workspaces, list_pages, get_workspace, resolve_comment, delete_comment). Added MCP_MODE=http/all support, A2A handler with Bearer auth + Claude SDK tool-calling loop (max 10 iterations, 60s timeout), agent card endpoint, health check. Used WebStandardStreamableHTTPServerTransport for Hono compatibility. Added AbortSignal.timeout(10s) to apiCall.

### Errors
None. TypeScript passed on first attempt (0 errors).

## [Task 3 — feat-3: API DEMO_MODE Middleware] 2026-04-16

### Summary
Added DEMO_MODE middleware to `notion/apps/api/src/index.ts`. Three changes: (1) production safety guard that throws at startup if `NODE_ENV=production && DEMO_MODE=true`, (2) module-level `demoUser` cache to avoid repeated DB upserts, (3) modified JWT auth middleware to short-circuit with a fixed demo user (`walletAddress: 0x...DEMO`) when `DEMO_MODE=true`, bypassing JWT validation entirely. Normal JWT flow unchanged when DEMO_MODE is off.

### Errors
None. TypeScript passed on first attempt (0 errors).

## [Task 2 — notion-ui-polish: globals.css 토큰 강화] 2026-04-17

### Summary
Updated 6 design tokens in `notion/apps/web/src/app/globals.css` to match Notion 실측값: bg-hover 0.04→0.08, bg-active 0.08→0.16, selection 0.14→0.28, shadow-menu first-layer 0.05→0.1, and added new `--text-placeholder` token in both `:root` (rgba(55,53,47,0.35)) and `.dark` (rgba(255,255,255,0.25)) blocks. Mirrored the same changes in `notion/DESIGN.md` to keep design source-of-truth in sync.

### Errors
None. All 6 edits applied cleanly on first attempt; Grep verification confirmed correct values in both files.


## Task 3 — globals.css: --duration-hover + .notion-hover/.notion-menu 유틸 클래스 (2026-04-17)

**Status:** SUCCESS

**Changes applied to `notion/apps/web/src/app/globals.css`:**
1. Added `--duration-hover: 20ms` in `@theme` block (line 42) before `--duration-micro`.
2. `.block-handle-btn` transition updated to use `var(--duration-hover)` (lines 220-221).
3. Added `.animate-dropdown-in`, `@keyframes menu-fade-out` + `.animate-dropdown-out`, `@keyframes modal-slide-up` + `.animate-modal-in` after existing `@keyframes menu-fade-in` (lines 255-273).
4. `.slash-command-menu` animation changed from `slash-fade-in 100ms ease-out` to `menu-fade-in var(--duration-short) ease-out` (line 188).
5. Appended "Notion UI Utilities" section at EOF with `@layer utilities { ... }` wrapper containing `.notion-hover`, `.notion-menu`, `.notion-focus-ring`, `.notion-divider-line`, `.notion-scrollbar` (lines 361-397).

**Verification:** Grep confirmed all 5 required tokens (`--duration-hover`, `.notion-hover`, `.notion-menu`, `.animate-dropdown-in`, `.animate-modal-in`) present. No duplicate `@keyframes` names.

## Task 4 — NotionMenuItem.tsx 생성
- Created: notion/apps/web/src/components/ui/NotionMenuItem.tsx
- Danger color uses var(--color-red) (verified in globals.css line 85)
- notion-hover class used (verified in globals.css line 367)
- Timestamp: 2026-04-17T11:58:12+00:00

## Task 6 — NotionDivider.tsx 생성 (2026-04-17)
- Created: notion/apps/web/src/components/ui/NotionDivider.tsx
- index.ts: does not exist, skipped
- Evaluator: PASS (NotionDivider + notion-divider-line both found)

## Task 5 — NotionDropdown.tsx 생성 (2026-04-17)
- Created: notion/apps/web/src/components/ui/NotionDropdown.tsx (16 lines)
- Thin div wrapper applying `notion-menu animate-dropdown-in` + forwarded `className` via `cn()` from `@/lib/utils`
- Intentionally not Radix-based — `animate-dropdown-in` uses `forwards` fill-mode; Radix components must use their own data-state driven animations, not this wrapper
- Reviewer: PASS (correct imports, ReactNode, className forwarding, cn() usage)
- Evaluator: PASS (NotionDropdown + notion-menu both found in file)

## Task 8 — 에디터 블록 핸들 + 슬래시 메뉴 개선 (2026-04-17)

- block-handle-overlay.tsx: container에 `transition-opacity duration-100 ease-in` 추가 (기존 inline transition 제거)
- block-handle-overlay.tsx: 버튼들은 이미 `block-handle-btn` / `block-handle-btn--drag` 사용 중 (변경 없음)
- block-handle.tsx: 순수 ProseMirror Plugin Extension으로 wrapper div 없음 (변경 불필요)
- slash-command-list.tsx: 컨테이너에 `notion-menu notion-scrollbar max-h-80` 추가, z-index/포지셔닝 유지
- slash-command-list.tsx: 아이템 버튼 `hover:bg-[var(--bg-hover)]` → `notion-hover`로 교체, 선택 상태(`bg-[var(--bg-hover)]`)는 유지
- 평가: notion-hover/notion-menu/transition-opacity/block-handle-btn 모두 확인됨 → PASS

## Task 9: 버블 메뉴 개선 — PASS
- File: notion/apps/web/src/components/editor/bubble-menu.tsx
- BubbleMenu: separated into outer <BubbleMenu> (positioning) + inner <div> with `notion-menu animate-dropdown-in flex items-center gap-0.5 p-1`
- Removed duplicate rounded/bg/shadow classes (now inherited from .notion-menu in globals.css)
- Format buttons + Palette button: `notion-hover flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)]`
- Active state: `bg-[var(--bg-active)] text-[var(--accent-blue)]` (changed from text-primary to accent-blue per spec)
- Removed `hover:bg-[var(--bg-hover)]` and `transition-colors duration-[var(--duration-micro)]` (handled by .notion-hover)
- Evaluator: grep notion-menu / notion-hover / animate-dropdown-in — all present

## Task 10 — 에디터 타이포그래피 & placeholder (2026-04-17)

- Confirmed `notion-editor` class already on editor wrapper in `block-editor.tsx` (line 51).
- Appended `@layer components {}` block to `globals.css` with rules:
  - Placeholder (`p.is-editor-empty:first-child::before`, `.is-empty::before`) using `--text-placeholder`.
  - Inline code `code:not(pre code)` with Notion grey (rgba 135/131/120 .15) + `--color-red`.
  - Link: blue, no underline by default, underline on hover.
  - Bold: weight 600 (Notion-matching, not 700).
  - Code block `pre` + `pre code` reset.
- Evaluator: all 4 greps PASS.
- Reviewer: no syntax errors, correct layer (`components`, not utilities).
- Note: existing styled-jsx rules inside `block-editor.tsx` still define similar selectors; globals.css rules coexist, styled-jsx specificity may win but both carry Notion-matching values.

## Task 13 — 모달 & 팝오버 개선 (2026-04-17)

- File: notion/apps/web/src/components/search-modal.tsx
  - Backdrop: removed inline `style={{ background: 'rgba(0,0,0,0.4)' }}`, added `bg-black/40` to className
  - Modal panel: `md:rounded-[var(--radius-lg,10px)]` → `md:rounded-[8px]`; `shadow-[var(--shadow-modal,...)]` → `shadow-[var(--shadow-modal)]`; added `animate-modal-in`
  - Search input: added `autoFocus` attribute
  - Result item button: prepended `notion-hover` class
- File: notion/apps/web/src/components/ui/popover.tsx
  - PopoverContent className: removed custom rounded/bg/shadow, replaced with `notion-menu` (styles inherited from globals.css)
  - Added `p-1` and `z-[var(--z-dropdown,60)]` (replacing `z-[60]`)
  - Preserved existing `animate-in fade-in-0 zoom-in-95 duration-150` (shadcn animation) — did NOT use `animate-dropdown-in` to avoid conflict with close state (per autoplan review warning)
  - Added `data-state={open ? 'open' : 'closed'}` for future Radix-compatible transitions
- Evaluator: grep `animate-modal-in` / `notion-hover` in search-modal.tsx PASS; grep `notion-menu` in popover.tsx PASS
- CSS tokens verified in globals.css: `--z-dropdown` (L34), `--shadow-modal` (L82,122), `.animate-modal-in` (L271), `.notion-hover` (L367), `.notion-menu` (L379)

## Task 7 — 사이드바 notion-hover 적용
- sidebar.tsx: 모든 `hover:bg-[var(--bg-hover)]` 패턴 (17곳) → `notion-hover` 대체
- sidebar.tsx: desktop aside에 `transition-[width] duration-200 ease-in-out` 추가
- page-tree-item.tsx: row에 `notion-hover` 적용, chevron에 `transition-transform duration-100 ease-in`, "+" 버튼에 `transition-opacity duration-[20ms]` 추가
- `hover:bg-[var(--bg-active)]` 는 의도적 강조 hover이므로 유지
- 검증: sidebar(17) + page-tree-item(1) notion-hover 적용, 남은 bare hover:bg-gray/white 없음, TypeScript clean

## Task 12 — 데이터베이스 뷰 스타일 (2026-04-17)

- table-view.tsx: 셀 div에 `notion-hover rounded-none` 추가 (border-radius:3px override → 0)
- board-view.tsx: BoardCard shadow를 `shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-menu)]` + `duration-[var(--duration-hover)]` 토큰화
- filter-toolbar.tsx: Filter/Sort 트리거를 flat notion 칩(`notion-hover px-2 h-6 rounded-[3px] text-xs bg-[var(--bg-hover)]`)으로 변경

Evaluator: notion-hover(table-view/filter-toolbar) + shadow-card/shadow-menu(board-view) grep all PASS. TypeScript clean.

## Task 11 — 상단바 & 브레드크럼 2026-04-17

### Result: SUCCESS
- page.tsx: notion-hover applied to breadcrumb + action buttons, CSS variable colors

## feat-A — Canvas empty-channelId guard (2026-04-17)

### Summary
Fixes ISSUE-001 (critical, frontend). CanvasEditor was mounting with `channelId=''` while the parent page's SWR channel lookup was still pending, producing `GET /api/channels//canvases 404` + `POST /api/channels//canvas 405`. Silent failure with no toast.

### Changes
- `slack/src/app/workspace/channel/[channelName]/page.tsx` (L510): gated mount on `canvasOpen && channelId` instead of just `canvasOpen`. Single highest-leverage fix.
- `slack/src/components/canvas/CanvasEditor.tsx`: defense-in-depth — each of the three `channelId`-interpolating fetches (loadList, role lookup effect, handleCreateCanvas) early-returns with `console.error('canvas: channelId missing, skipping fetch')` when `!channelId`.
- `handleCreateCanvas`: on non-2xx, read body via `.json().catch(()=>null)`, call `showToast` with server error or fallback `"Failed to create canvas (status <code>)"`, plus `console.error` with status + body.

### Errors
None. `npx tsc --noEmit -p tsconfig.json` → 0 errors.

### Lesson
When a parent resolves an ID async via SWR, defaulting the unresolved value to `''` and passing it to a child that unconditionally fetches is a footgun. Always gate the child mount on the resolved ID AND guard the child's own fetches. "Unreachable" defense still fires when the parent contract changes.

## feat-B — Canvas 500 backend fix (2026-04-17)

### Summary
Fixes ISSUE-002 (critical, backend). Both `GET /api/channels/:id/canvases` and `POST /api/channels/:id/canvas` were returning 500 with empty body. Root cause: schema declares `canvases.pageId` (migration 0010) but the live DB wasn't guaranteed to have the column; drizzle's bare `.select()` / `.returning()` emit every schema column, so runtime SQL references `page_id` and Postgres errors with `column "page_id" does not exist`. Empty body resulted because Next.js' default 500 path produces no JSON.

### Changes
- `slack/src/app/api/channels/[channelId]/canvas/route.ts`:
  - Added module-level `canvasColumns` const — explicit projection that omits `page_id`.
  - GET: swapped bare `.select()` on canvases for `.select(canvasColumns)`; wrapped whole handler in try/catch returning `{ error, detail }` 500 on failure.
  - POST: kept prior explicit `.returning({...})` but replaced with `.returning(canvasColumns)` (same shape, single source of truth); wrapped whole handler in try/catch.
- `slack/src/app/api/channels/[channelId]/canvases/route.ts`:
  - GET: already used explicit column list, added outer try/catch returning `{ error, detail }` 500.

### Errors encountered
None. `npx tsc --noEmit` → exit 0.

### Lesson
Drizzle's bare `.select()` and `.returning()` silently project every column declared in the schema. When schema and DB drift (new columns added in a recent migration not yet applied in some env), these produce opaque 500s. Two defenses: (1) always project an explicit column set for reads that don't need the whole row, (2) wrap every route handler's outer boundary in try/catch that serializes the error — empty 500 bodies make frontend debugging guesswork.

## F3 — /notion-embed/* subroute verification (2026-04-17)

### Summary
Verified all three F3 deliverables already meet spec; no code changes required.
- `slack/src/app/notion-embed/layout.tsx`: minimal wrapper, only imports `./globals-notion.css`. Does NOT pull in slack's `ThemeProvider`, `ToastProvider`, or `Web3Provider` (root `slack/src/app/layout.tsx` confirmed as the source of those providers — none leak into the embed subtree). Renders a `<div className="notion-embed-root min-h-screen bg-white text-neutral-900">` so the iframe shows Notion's white background even though slack's root `<html>` carries `dark`.
- `slack/src/app/notion-embed/pages/[id]/page.tsx`: uses Next 16 App Router promise-params pattern (`params: Promise<{ id: string }>` + `const { id } = await params;`), renders `<NotionPage pageId={id} mode="full" />` inside `h-screen w-screen`. Spec mentions "rsync from notion/apps/web", but slack's existing `slack/src/components/notion/NotionPage` (with matching `mode='full'` support, line 14: `export type NotionPageMode = 'panel' | 'full';`) is the right target — confirmed exported.
- `slack/src/app/notion-embed/globals-notion.css`: 462 lines, full token set + prose / block / menu / modal styles. Not empty.
- No auth guard inside `layout.tsx`. Spec test #6 expects 401/redirect, but enforcement lives at API/WS layer per spec. Did not add or remove any guard here.

### TS check
`cd slack && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "notion-embed"` → no matches (0 errors in F3 surface).

### Result
PASS — F3 already implemented correctly. Marked done in todo.md; no source files modified.

---

## feat-C — resolveChannelParam consistency (2026-04-17)

### Summary
Fixes ISSUE-003. The top-level `/api/channels/[channelId]/route.ts` already used `resolveChannelParam` (accepts UUID *or* channel name), but the 5 sub-routes (`messages`, `members`, `canvas`, `canvases`, `mcp`) used the raw URL param directly in `eq(channels.id, ...)` / `eq(channelMembers.channelId, ...)` queries. Result: name-based URLs like `/api/channels/test/mcp` produced opaque 500s (Postgres UUID cast failure) or stuck 403 "Not a member" (UUID-shaped query on a non-UUID string silently returning no rows). Every sub-route now resolves the param to a concrete channel row first and returns structured JSON 404 when the channel is unknown.

### Changes
- `slack/src/app/api/channels/[channelId]/messages/route.ts`: GET + POST now call `resolveChannelParam(param, user.id)` at handler start; 404 on null; reassign `channelId = channel.id`; wrapped both handlers in outer try/catch returning `{ error, detail }` 500.
- `slack/src/app/api/channels/[channelId]/members/route.ts`: GET + POST + PATCH + DELETE all call `resolveChannelParam`. POST reuses the resolved row's `isPrivate`/`name`/`workspaceId` instead of refetching channel columns. DELETE reuses resolved `name` for the system message. All wrapped in outer try/catch.
- `slack/src/app/api/channels/[channelId]/canvas/route.ts`: GET + POST call `resolveChannelParam`; POST reuses resolved `workspaceId`/`name` instead of an extra channel fetch. Dropped now-unused `channels` schema import. `workspaceId` extracted to a narrowed local so TS accepts it inside the transaction callback. Existing try/catch preserved.
- `slack/src/app/api/channels/[channelId]/canvases/route.ts`: GET calls `resolveChannelParam`. Existing try/catch preserved.
- `slack/src/app/api/channels/[channelId]/mcp/route.ts`: GET + POST + PATCH + DELETE all call `resolveChannelParam`; added outer try/catch with `{ error, detail }` 500 envelopes — this route previously had none, so a thrown DB error surfaced as empty Next.js 500.

### Errors encountered
One round of TS2769 errors on canvas/route.ts: the resolved channel's `workspaceId` is typed `string | null`, and destructuring it into an intermediate object (`ch.workspaceId`) didn't narrow inside the nested `db.transaction` callback. Fixed by assigning to a bare local `const workspaceId = resolvedChannel.workspaceId;` after the null check. `npx tsc --noEmit` → exit 0 after fix.

### Lesson
When a URL param is polymorphic (UUID | slug | name), the resolver pattern belongs at the *handler boundary*, not scattered inside DB queries. Passing a non-UUID string into `eq(uuidColumn, ...)` is a silent footgun: Postgres raises a cast error surfaced as a plain 500, and in the membership-lookup path it can even return an empty result (read as "not a member") instead of throwing. Every sub-route under a polymorphic segment must resolve first and branch on the resolved-or-null result.
