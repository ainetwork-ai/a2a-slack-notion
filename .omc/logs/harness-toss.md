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
