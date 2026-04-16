<!-- /autoplan restore point: /home/comcom/.gstack/projects/ainetwork-ai-a2a-slack-notion/main-autoplan-restore-20260416-042604.md -->
# Notion Clone -- Gap Implementation Plan (TDD-Focused)

**Created:** 2026-04-16
**Updated:** 2026-04-16 (autoplan review — added Task 0: Block UX Fidelity)
**Scope:** 15 feature areas across ~75 new/modified files
**Estimated Complexity:** HIGH
**Test Framework:** Vitest (unit/integration), Playwright (e2e)
**Methodology:** Red-Green-Refactor TDD for every task

> **autoplan verdict:** Original plan covered 14 feature additions but had ZERO coverage of block interaction UX — the core thing that makes Notion feel like Notion. Block UX score audited at 2.5/10. Task 0 added as P0 foundational work. All other tasks depend on this being solid first.

---

## Table of Contents

1. [File Structure Map](#file-structure-map)
2. [Task 0: Block Interaction UX Fidelity](#task-0-block-interaction-ux-fidelity-notion-feel) ← **NEW — P0 FOUNDATIONAL**
3. [P0 -- Critical Features](#p0----critical-features)
   - Task 1: Forms (Form Builder + Submission Flow)
   - Task 2: Sprints (Sprint Model + Planning Views)
   - Task 3: Automations Completion (Triggers + Actions)
3. [P1 -- High Value Features](#p1----high-value-features)
   - Task 4: AI Autofill (Claude API Integration)
   - Task 5: Linked Databases (Cross-Database Views)
   - Task 6: Sub-item Dependencies (Timeline Visualization)
4. [P2 -- Medium Features](#p2----medium-features)
   - Task 7: Dashboard View
   - Task 8: Backlinks Panel
   - Task 9: Presentation Mode
5. [P3 -- Nice-to-Have](#p3----nice-to-have)
   - Task 10: Missing Property Types (Button, Unique ID, Place)
   - Task 11: View Tab Customization
   - Task 12: Database Locking
   - Task 13: Advanced Filters (Personal vs. Shared, 3-Level Nesting)
   - Task 14: Feed / Map Views
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Open Questions](#open-questions)

---

## File Structure Map

### New Files

```
notion/
  apps/api/
    prisma/
      migrations/YYYYMMDD_forms_sprints_ai/   # Migration for new models
    src/
      routes/
        forms.ts                               # Task 1: Form CRUD + submission
        sprints.ts                             # Task 2: Sprint CRUD + management
        ai.ts                                  # Task 4: AI autofill endpoints
        linked-databases.ts                    # Task 5: Linked database views
      lib/
        automation-actions/                    # Task 3: Action handlers (one per file)
          send-mail.ts
          send-webhook.ts
          send-slack.ts
          add-page-to.ts
          edit-pages-in.ts
          define-variables.ts
        automation-scheduler.ts                # Task 3: Recurring trigger via BullMQ
        ai-service.ts                          # Task 4: Claude API wrapper
      __tests__/                               # Unit tests (Vitest)
        forms.test.ts
        sprints.test.ts
        automations.test.ts
        ai-service.test.ts
        linked-databases.test.ts
        dependencies.test.ts
  apps/web/
    src/
      components/
        form/
          form-builder.tsx                     # Task 1: Drag-drop form builder
          form-field.tsx                       # Task 1: Individual form field
          form-preview.tsx                     # Task 1: Live preview
          form-submission-view.tsx             # Task 1: Public submission page
          form-responses.tsx                   # Task 1: Response viewer
        sprint/
          sprint-board.tsx                     # Task 2: Sprint planning board
          sprint-config.tsx                    # Task 2: Sprint settings
          sprint-header.tsx                    # Task 2: Active sprint header
          backlog-view.tsx                     # Task 2: Backlog management
        ai/
          ai-autofill-menu.tsx                 # Task 4: Property autofill UI
          ai-query-bar.tsx                     # Task 4: Natural language DB query
          ai-formula-helper.tsx                # Task 4: Formula AI assistant
        database/
          dashboard-view.tsx                   # Task 7: Dashboard layout
          feed-view.tsx                        # Task 14: Activity feed view
          map-view.tsx                         # Task 14: Geo map view
          linked-database-view.tsx             # Task 5: Linked DB wrapper
          dependency-overlay.tsx               # Task 6: Timeline dep arrows
          presentation-view.tsx                # Task 9: Slideshow mode
        editor/
          backlinks-panel.tsx                  # Task 8: Backlinks sidebar
      stores/
        form.ts                                # Task 1: Form state
        sprint.ts                              # Task 2: Sprint state
      app/
        (app)/workspace/[workspaceId]/
          form/[formId]/
            page.tsx                           # Task 1: Form builder page
            submit/
              page.tsx                         # Task 1: Public form page
        (public)/
          form/[token]/
            page.tsx                           # Task 1: External form URL
  packages/shared/src/
    form.ts                                    # Task 1: Form types
    sprint.ts                                  # Task 2: Sprint types
    ai.ts                                      # Task 4: AI request/response types
  e2e/
    forms.spec.ts                              # Task 1: E2E tests
    sprints.spec.ts                            # Task 2: E2E tests
    automations-extended.spec.ts               # Task 3: E2E tests
    ai-autofill.spec.ts                        # Task 4: E2E tests
```

### Modified Files

```
notion/
  apps/api/prisma/schema.prisma                # Tasks 1,2,4,5,12: New models
  apps/api/src/index.ts                        # Tasks 1,2,4,5: Mount new routes
  apps/api/src/lib/queue.ts                    # Tasks 3,4: New queues
  apps/api/src/lib/automation-engine.ts         # Task 3: New triggers/actions
  apps/api/src/routes/automations.ts            # Task 3: Extended schemas
  apps/api/src/routes/databases.ts              # Tasks 5,6,10,12: New endpoints
  packages/shared/src/database.ts               # Tasks 5,6,10: New types
  packages/shared/src/index.ts                  # Tasks 1,2,4: Re-exports
  apps/web/src/components/database/
    database-view.tsx                           # Tasks 5,7,9,11: New view types
    timeline-view.tsx                           # Task 6: Dependency arrows
    table-view.tsx                              # Task 10: New property cells
    property-cell.tsx                           # Task 10: Button/ID/Place cells
    filter-toolbar.tsx                          # Task 13: Advanced filters
  apps/web/src/stores/database.ts               # Tasks 5,6: Linked DB + deps
  apps/web/src/components/editor/
    collaborative-editor.tsx                    # Task 8: Backlinks panel mount
  apps/web/src/components/sidebar/sidebar.tsx   # Task 2: Sprint nav item
```

---

## Task 0: Block Interaction UX Fidelity (Notion Feel)

> **Added by autoplan design review (opus designer, 2026-04-16). Block UX audited at 2.5/10. This task is P0-foundational — ships before all other tasks.**

**Priority:** P0
**Estimated complexity:** High
**Dependencies:** None (foundational — all other tasks build on top)

---

#### Context

The block editor is the single most-touched surface in the entire product. Every keystroke, every hover, every drag-and-drop happens here. Right now, the block interaction layer feels like a prototype:

- A single drag grip with **Delete + Duplicate only** in the menu (no "Turn into", no color, no "Copy link")
- A slash command that is a **standalone React component** (not a Tiptap Suggestion extension) — this races with ProseMirror's keyboard handling and causes focus/cursor bugs
- **Zero block selection** — no `NodeSelection`, no blue left border, no multi-select
- **Zero block animations** — blocks appear/disappear instantly
- The block handle creates **N DOM elements via `Decoration.widget` on every transaction** — O(n) performance bug

Users coming from Notion will immediately feel the gap. Micro-interactions they rely on (hover block → see `+` and drag, click grip → full context menu, shift-click → multi-select, `/` → categorized fuzzy search) are either missing or half-built.

**Design Scorecard (pre-Task 0):**

| Element | Current | Target | Gap | What gets us to 9+ |
|---------|:-------:|:------:|-----|---------------------|
| Block handle (two-button system) | 2/10 | 9/10 | CRITICAL | + nested block handles, keyboard reorder (Tab/Space), mobile long-press |
| Block context menu | 1/10 | 9/10 | CRITICAL | + keyboard nav in menu, "Move to page" working, "Comment" working |
| Block selection (single + multi) | 0/10 | 9/10 | CRITICAL | + keyboard-only selection (Escape/Shift+Arrow), full selection toolbar |
| Slash command UX | 3/10 | 9/10 | CRITICAL | + fuzzy search, recently used section, keyboard shortcuts shown |
| Drag-and-drop | 2/10 | 9/10 | CRITICAL | + @dnd-kit integration, smooth ghost, animated drop indicator, reorder animation |
| Block animations | 1/10 | 9/10 | CRITICAL | + height collapse on delete, reorder transition, spring-feel on drop |
| Empty block / placeholder UX | 5/10 | 9/10 | GAP | + per-block-type placeholders, hover opacity bump |
| Block types (callout, toggle) | 0/10 | 9/10 | CRITICAL | + emoji picker for callout, nested toggle, 2-col/3-col columns block |
| Block color system | 0/10 | 9/10 | CRITICAL | + color persists through "Turn into", applies to all block types |

**Overall Block UX Score: 2.5 / 10 → target 9.0 / 10 after this task.**

---

#### Design Spec: Block Handle System (Two-Button)

**Current state:** Single drag grip icon. No `+` button. No vertical center alignment per block type.

**Target:** Two-button system left of every hovered block.

```
                          |  Block content starts here
  [+]  [drag]            |
   ^      ^              |
   |      grip: 6-dot drag handle (click → context menu, drag → reorder)
   add: inserts block below (opens slash menu in new block)
```

**Measurements:**
- Handle container: `width: 48px`, `height: 24px`, `display: flex`, `align-items: center`, `gap: 0`
- Each button: `width: 24px`, `height: 24px`, centered icon
- Position: `position: absolute`, `left: -52px` from content edge
- **Vertical alignment**: Center relative to the **first line** of the block (not entire block height). Compute: `top: (firstLineHeight / 2) - 12px`. For `16px` body text at `line-height: 1.5` → `top: 0px`. For H1 `30px` at `line-height: 1.3` → `top: 7.5px`.

**Visibility:**
```css
.block-handle-container {
  position: absolute;
  left: -52px;
  display: flex;
  align-items: center;
  gap: 0;
  opacity: 0;
  transition: opacity var(--duration-micro) ease; /* 100ms */
  user-select: none;
  z-index: 10;
}

.notion-editor .tiptap > *:hover > .block-handle-container {
  opacity: 1;
}

.block-handle-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-radius: 3px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: background-color var(--duration-micro) ease, color var(--duration-micro) ease;
}

.block-handle-btn:hover {
  background-color: var(--bg-hover);   /* rgba(55,53,47,0.04) */
  color: var(--text-secondary);
}

.block-handle-btn:active {
  background-color: var(--bg-active);  /* rgba(55,53,47,0.08) */
}

.block-handle-btn--drag {
  cursor: grab;
}

.block-handle-btn--drag:active {
  cursor: grabbing;
}
```

**`+` button behavior:**
- Icon: Lucide `Plus`, `14px`, `color: var(--text-tertiary)`
- Click: Insert empty paragraph below current block, then open slash command menu in that block

**Drag handle button behavior:**
- Icon: 6-dot grip SVG at `10×14px` viewBox rendered at `14px` height
- Click (no drag): Open block context menu
- Drag: Initiate block reorder

**Performance fix:** Current implementation creates `Decoration.widget` for EVERY block on every transaction (O(n) DOM operations per keystroke). New approach: track hovered block in plugin state via `handleDOMEvents.mouseover` — create decoration for **hovered block only** (O(1)).

---

#### Design Spec: Drag-and-Drop (9/10 target requires @dnd-kit)

**Current state:** Native HTML5 drag. No smooth animation, ugly browser ghost, no visual drop indicator, position resolution is naive. 2/10.

**Why @dnd-kit is required for 9/10:** Native HTML5 drag cannot produce smooth surrounding-block animations, custom ghost overlay, or accessible keyboard reorder. These are the exact things that make Notion's drag feel premium.

**Integration pattern (@dnd-kit + ProseMirror):**
```
DndContext (wraps editor, handles drag state)
  └─ SortableContext (items = top-level block node positions)
       └─ Each top-level block = useSortable() React wrapper
            └─ ProseMirror NodeView renders block CONTENT inside wrapper
```

Top-level blocks each get a custom `NodeViewRenderer` that wraps content in a `SortableBlock` component. @dnd-kit owns the outer shell (position/transform), ProseMirror owns the inner content (text editing). The trick: render `NodeView` as a React component via `ReactNodeViewRenderer` so the wrapper can use `useSortable()`.

**On drag end:** Compute new position in ProseMirror document from @dnd-kit's `over` index → dispatch `tr.move(from, to, insertPos)`.

**Drag visual spec:**
- Ghost: exact clone at `opacity: 0.85`, `transform: rotate(1.5deg)`, `box-shadow: var(--shadow-modal)`
- Source placeholder: `opacity: 0.25` (block stays at original position as ghost)
- Drop indicator line: `height: 2px`, `background: var(--accent-blue)`, `border-radius: 1px`, full content width, appears between blocks at target
- Surrounding blocks shift: `transform: translateY(Npx)`, `transition: transform 150ms ease-in-out`
- On drop spring: `transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot — Notion's natural feel)

```css
.block-drag-ghost {
  opacity: 0.85;
  transform: rotate(1.5deg);
  box-shadow: 0 0 0 1px rgba(15,15,15,0.05), 0 5px 10px rgba(15,15,15,0.1), 0 15px 40px rgba(15,15,15,0.2);
  pointer-events: none;
}

.block-drag-source { opacity: 0.25; }

.block-drop-indicator {
  height: 2px;
  background: var(--accent-blue);
  border-radius: 1px;
  pointer-events: none;
  animation: drop-indicator-appear var(--duration-micro) ease-out;
}

@keyframes drop-indicator-appear {
  from { opacity: 0; transform: scaleX(0.8); }
  to   { opacity: 1; transform: scaleX(1); }
}
```

**Keyboard reorder (accessibility — required for 9/10):**
- Tab to focus drag handle button
- `Space`: "pick up" block — screen reader announces "Block lifted. Arrow keys to move, Space to drop, Escape to cancel."
- `ArrowUp / ArrowDown`: moves block one position
- `Space`: drop at current position
- `Escape`: return to original position with animation

**TDD steps:**
- [ ] **RED:** Test drag start sets source block to `.block-drag-source` opacity
- [ ] **RED:** Test @dnd-kit `onDragEnd` dispatches correct ProseMirror move transaction
- [ ] **RED:** Test keyboard Space picks up block, ArrowDown moves it, Space drops it
- [ ] **RED:** Test Escape returns block to original position
- [ ] **GREEN:** Implement `SortableBlock` NodeView wrapper + `DndContext` around editor
- [ ] **REFACTOR:** Extract index-to-ProseMirror-position mapping into utility

---

#### Design Spec: Block Context Menu

**Current state:** Delete, Duplicate, dead "Turn into..." (no-op). Built with raw DOM manipulation — cannot use React, Lucide icons, or shadcn. Gets clipped by parent `overflow`.

**Target:** Full 7-item menu with submenus, icons, keyboard shortcuts. React component at `position: fixed`.

**Menu structure:**

| Label | Icon (Lucide 16px) | Shortcut | Action |
|-------|-------------------|----------|--------|
| Delete | `Trash2` | `Del` | Delete block node |
| Duplicate | `Copy` | `Ctrl+D` | Insert deep copy after block |
| Turn into | `ArrowRightLeft` | (submenu `ChevronRight`) | Open Turn Into submenu |
| Copy link to block | `Link` | — | Copy `{origin}/workspace/{wid}/{pid}#block-{id}` → toast |
| Move to | `CornerUpRight` | (submenu) | Opens page picker: search input + page list. Selected page receives block as child. |
| Comment | `MessageSquare` | `Ctrl+Shift+M` | Opens inline comment thread anchored to block (same comment component as inline text comments). |
| ─── divider ─── | | | |
| Color | `Palette` | (submenu `ChevronRight`) | Open color picker submenu |

**Container styling:**
```css
.block-context-menu {
  position: fixed;
  min-width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--bg-default);
  box-shadow: 0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2);
  border-radius: 6px;
  padding: 4px 0;
  z-index: 20;
  animation: menu-fade-in var(--duration-short) ease-out;
}

@keyframes menu-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.block-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 12px;
  margin: 0 4px;
  font-size: 14px;
  color: var(--text-primary);
  border-radius: 3px;
  cursor: pointer;
  width: calc(100% - 8px);
  transition: background-color var(--duration-micro) ease;
}

.block-context-menu-item:hover { background-color: var(--bg-hover); }
.block-context-menu-item--destructive:hover { color: #eb5757; }
.block-context-menu-item--disabled { opacity: 0.4; pointer-events: none; }

.block-context-menu-shortcut {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.block-context-menu-divider {
  height: 1px;
  background: var(--divider);
  margin: 4px 0;
}
```

**Turn Into submenu:** Positioned right of parent menu. Same shadow/radius/padding. Items: Text, Heading 1, Heading 2, Heading 3, ─, Bullet list, Numbered list, To-do list, Toggle list, ─, Quote, Code, Callout, Divider. Currently active type gets `Check` icon (12px, `var(--accent-blue)`) on right.

**Color submenu:** Two sections (COLOR / BACKGROUND), each with 10 swatches (22×22px, `border-radius: 3px`). Text colors show bold "A" in the color. Background colors show a filled square. Uses the 9 DESIGN.md block colors + Default.

**Architecture change (CRITICAL):** Delete current raw-DOM menu. Create `BlockContextMenu` React component using `position: fixed` with coordinates from Zustand store. Same pattern as `EditorBubbleMenu`.

**Keyboard navigation in menu (required for 9/10):**
- When menu opens, first item is auto-focused
- `ArrowDown / ArrowUp`: navigate items
- `Enter`: execute focused item
- `Escape`: close menu, return focus to editor
- `ArrowRight` on items with submenus: open submenu
- `ArrowLeft` in submenus: close submenu, return to parent
- Screen reader: `role="menu"`, items `role="menuitem"`, submenus `role="menu"` with `aria-expanded`

**Move to page submenu (required for 9/10):**
- Input: search field at top (`placeholder: "Find a page..."`, autofocused)
- List: pages in current workspace filtered by search query
- Calls existing `/api/v1/pages` search endpoint
- On select: `PATCH /api/v1/blocks/{blockId}` to move block under selected page

**Comment (required for 9/10):**
- Uses the same comment thread component as inline text comments
- Block gets a `data-block-id` attribute
- Comment thread anchored to block ID (not text range)
- Thread appears in right panel (or inline below block if no panel)

---

#### Design Spec: Block Selection System

**Current state:** Zero. No selection, no visual feedback.

**Single block selection:**
- Trigger: Click the drag handle
- Implementation: Dispatch `NodeSelection.create(view.state.doc, pos)`
- Visual:
  ```css
  .ProseMirror .ProseMirror-selectednode {
    outline: none;
    background-color: var(--selection); /* rgba(35,131,226,0.14) */
    border-left: 2px solid var(--accent-blue);
    margin-left: -2px; /* prevent layout shift */
  }
  ```
- Dismiss: Click elsewhere or `Escape`

**Keyboard-only block selection (required for 9/10):**
- `Escape` from text cursor → selects the current block (NodeSelection)
- `Escape` again → clears selection, focus to editor
- When a block is selected (NodeSelection): `ArrowUp/Down` moves selection to adjacent block
- `Backspace` or `Delete` when block selected → delete the block
- `Enter` when block selected → enter text editing mode inside block
- `Ctrl+D` when block selected → duplicate the block

**Multi-block selection:**
- Trigger: `Shift+Click` on another block's drag handle
- Visual: CSS class `.block-selected` on all blocks in range (same blue border + selection bg)
- Keyboard: `Shift+ArrowDown/Up` extends selection from a selected block

**Selection toolbar** (appears above selected blocks, `position: fixed`):
- Buttons: Delete | Duplicate | Color | Turn into
- Same styling as `EditorBubbleMenu` — `background: var(--bg-default)`, `shadow: var(--shadow-menu)`, `border-radius: 6px`, `padding: 4px`

---

#### Design Spec: Slash Command Rewrite

**Current state:** Standalone React component listening to `editor.on('update')` + `document.addEventListener('keydown', ..., true)` (capture phase — hijacks ALL keyboard events globally). No categories, flat list of 15 items.

**Target:** Tiptap `Suggestion` extension (copy exact pattern from `Mention` in `extensions.ts:119-196`).

**Why this matters:** The Suggestion plugin intercepts at the ProseMirror plugin level — no race conditions, correct cursor handling, clean cleanup when dismissed.

**Command groups:**

```
BASIC BLOCKS
  Text | Heading 1 | Heading 2 | Heading 3
  Bullet list | Numbered list | To-do list
  Toggle list | Quote | Divider | Callout

MEDIA
  Image | Code | Table

EMBEDS
  Embed | Math equation | Mermaid diagram
```

**Popup spec:**
- Container: `width: 320px`, `max-height: 340px`, `overflow-y: auto`
- `background: var(--bg-default)`, `box-shadow: var(--shadow-menu)`, `border-radius: 6px`
- `z-index: 70` (above everything)
- Appear: `opacity 0→1` at `100ms ease-out`
- Group header: `font-size: 11px`, `font-weight: 500`, `color: var(--text-tertiary)`, `text-transform: uppercase`, `letter-spacing: 0.5px`, `padding: 8px 12px 4px`

**Item row** (`height: 44px`, `padding: 0 12px`, `gap: 10px`):
- Icon container: `40×40px`, `border-radius: 6px`, `background: var(--bg-hover)`, centered icon `20px`
- Title: `14px`, `color: var(--text-primary)`
- Description: `12px`, `color: var(--text-tertiary)`
- Hover + keyboard-selected: `background-color: var(--bg-hover)` on entire row

**Keyboard:**
- `ArrowDown/Up`: navigate (wraps)
- `Enter`: execute selected command
- `Escape`: dismiss (leave `/query` text in place)
- `Backspace` when query empty: dismiss and delete the `/`
- Filter: **fuzzy search** (not just substring) on title + description using a simple score: exact prefix match ranks highest, then any-position match, then description match. Use `fuse.js` (already common in Next.js projects, or implement 30-line scorer). Reset selection to index 0 on filter change.
- **Recently used section (required for 9/10):** When query is empty, show a "RECENTLY USED" group at the top (last 5 commands, stored in `localStorage`). Update on every command execution. This matches Notion's slash menu exactly.
- **Keyboard shortcuts shown in items (required for 9/10):** Each item that has a keyboard equivalent shows it right-aligned in the item row (e.g., `Heading 1` shows `#`, `Heading 2` shows `##`, `Bullet list` shows `-`, `To-do` shows `[]`). `font-size: 12px`, `color: var(--text-tertiary)`, `font-family: monospace`.

```css
.slash-command-menu {
  position: fixed;
  width: 320px;
  max-height: 340px;
  overflow-y: auto;
  background: var(--bg-default);
  box-shadow: 0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2);
  border-radius: 6px;
  padding: 0;
  z-index: 70;
  animation: slash-fade-in var(--duration-micro) ease-out;
}

@keyframes slash-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.slash-command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 12px;
  margin: 0 4px;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color var(--duration-micro) ease;
}

.slash-command-item:hover,
.slash-command-item--selected {
  background-color: var(--bg-hover);
}

.slash-command-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}
```

---

#### Design Spec: Block Type Additions

**Callout block** (current score: 0/10 — CRITICAL GAP):

```
+─[ emoji ]──[ content ─────────────────]─+
│  💡         Tip: Press '/' to add       │
│             new blocks below.           │
+─────────────────────────────────────────+
```

- `background: var(--bg-hover)`, `border-radius: 6px`, `padding: 16px`, `display: flex`, `gap: 12px`
- Emoji area: `width: 24px`, `flex-shrink: 0`, `font-size: 20px`, `cursor: pointer` (click → emoji picker)
- Content: `flex: 1`, standard Tiptap editable
- Default emoji: 💡
- Implementation: Custom Tiptap `Node` with `group: 'block'`, `content: 'block+'`, attrs `{ emoji, backgroundColor }`, React `NodeViewRenderer`
- **Emoji picker (required for 9/10):** Click emoji area → opens a floating emoji picker (`emoji-picker-react` or `@emoji-mart/react`, ~50KB). Picker position: below the emoji, left-aligned. `z-index: 20`. On select: updates `emoji` attr via `updateAttributes({ emoji })`. On click outside: close picker. The picker must follow DESIGN.md shadows: `box-shadow: var(--shadow-menu)`, `border-radius: 6px`.

**Toggle / Collapsible block** (current score: 0/10 — CRITICAL GAP):

```
▶ Toggle heading text                   (collapsed)
▼ Toggle heading text                   (expanded)
  └ Nested content is visible here.
```

- Disclosure triangle: `ChevronRight` 12px → `ChevronDown` when open
- Triangle transition: `transform: rotate(0/90deg)`, `transition: transform 100ms ease`
- Indent: `padding-left: 24px` for nested content
- Default: open (`true`)
- Implementation: Custom Tiptap `Node`, first child = always-visible paragraph, rest = collapsible via `NodeViewRenderer`
- **Nested toggle (required for 9/10):** A toggle can contain another toggle. The `content` schema is `'paragraph block*'` which already allows nesting. Indent each nested level `24px`. No depth limit.

**Columns block** (required for 9/10 — currently 0/10):

```
+──────────────────+──────────────────+
│  Column 1        │  Column 2        │
│  Any blocks      │  Any blocks      │
│  can go here     │  can go here     │
+──────────────────+──────────────────+
```

- Triggered by slash command: "2 columns", "3 columns"
- Layout: CSS Grid, `display: grid`, `grid-template-columns: repeat(N, 1fr)`, `gap: 16px`
- Each column: independent Tiptap content region (`content: 'block+'`), own block handles
- Column divider on hover: faint `1px` vertical line (`var(--divider)`) visible only on parent hover
- Resize handles: on hover of column divider, show a drag handle. Drag to resize ratio (stored as `{ widths: [50, 50] }` percent in node attrs).
- Min column width: `100px` — if editor is narrower, columns stack vertically (responsive)
- Implementation: Custom Tiptap `Node` with `content: 'tableCell+'` analogue. Each cell = `columnCell` node. Use `ReactNodeViewRenderer`.
- **Add column button:** `+` icon at right edge of last column (hover-revealed). Click → adds another column (max 5).
- **Remove column:** Click column header area → reveals `×` button to remove (merges content into adjacent column).

```css
.columns-block {
  display: grid;
  gap: 16px;
  margin: 4px 0;
}

.column-cell {
  min-width: 100px;
  position: relative;
}

/* Column divider on hover */
.columns-block:hover .column-cell + .column-cell::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--divider);
}

/* Resize handle */
.column-resize-handle {
  position: absolute;
  left: -8px;
  top: 0;
  bottom: 0;
  width: 16px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--duration-micro) ease;
}

.columns-block:hover .column-resize-handle { opacity: 1; }
```

---

#### Design Spec: Block Animations

**Current state:** Zero. Blocks appear/disappear instantly (1/10 — CRITICAL GAP).

```css
/* Block creation */
.block-just-created {
  animation: block-fade-in var(--duration-short) ease-out; /* 150ms */
}

@keyframes block-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Block deletion (apply class, wait 150ms, then dispatch delete transaction) */
.block-deleting {
  animation: block-fade-out var(--duration-short) ease-in forwards;
  overflow: hidden;
}

@keyframes block-fade-out {
  from { opacity: 1; max-height: 500px; }
  to   { opacity: 0; max-height: 0; padding: 0; margin: 0; }
}

/* NO animation on page load — instant render only */

/* Reorder animation — @dnd-kit handles surrounding block shifts (required for 9/10) */
/* See Drag-and-Drop spec: surrounding blocks use transform: translateY + 150ms ease-in-out */
/* Spring snap on drop: cubic-bezier(0.34, 1.56, 0.64, 1) 200ms */

/* Toggle open/close content animation (required for 9/10) */
.toggle-content {
  overflow: hidden;
  transition: max-height var(--duration-short) ease-in-out,
              opacity var(--duration-micro) ease;
}

.toggle-content[data-open="false"] {
  max-height: 0;
  opacity: 0;
}

.toggle-content[data-open="true"] {
  max-height: 2000px; /* large enough for nested content */
  opacity: 1;
}
```

Implementation:
- Block creation: ProseMirror plugin watches `tr.docChanged`, identifies inserted node positions, applies `.block-just-created` class via `setTimeout(removeClass, 200)`.
- Block deletion: Helper `deleteBlockWithAnimation(view, pos)` applies `.block-deleting`, waits 150ms, dispatches delete transaction.
- Reorder: @dnd-kit `SortableContext` handles surrounding-block `transform` transitions automatically via `useSortable()` + `CSS.Transform.toString()`.
- Toggle: CSS `max-height` transition — `data-open` attr toggled by `ToggleView` React component on click.

---

#### Design Spec: Empty Block UX

**Changes (minor but symptomatic):**

1. Change placeholder from `"Type '/' for commands..."` (has ellipsis) to `"Type '/' for commands"` (no ellipsis)
2. First paragraph at `pos === 0` in an empty doc shows: `"Press Enter to continue with an empty page, or pick a template..."`
3. Heading placeholders: `"Heading 1"`, `"Heading 2"`, `"Heading 3"` (already correct)
4. Add hover state: placeholder bumps from `--text-tertiary` to `--text-secondary` on block hover:
   ```css
   .notion-editor .tiptap > *:hover .is-empty::before {
     color: var(--text-secondary);
   }
   ```

---

#### Component Architecture

**Files to CREATE:**

| File | Purpose |
|------|---------|
| `components/editor/block-handle/block-handle-plugin.ts` | ProseMirror plugin: tracks hovered block → emits to Zustand. Single decoration for hovered block only (O(1), not O(n)). |
| `components/editor/block-handle/block-handle-view.tsx` | React: `+` button + drag handle. Reads position from store. |
| `components/editor/block-handle/block-context-menu.tsx` | React: full 7-item menu, submenus, `position: fixed`. |
| `components/editor/block-handle/turn-into-menu.tsx` | React: "Turn into" submenu with all block types. |
| `components/editor/block-handle/color-picker-menu.tsx` | React: 10 text + 10 background color swatches. |
| `components/editor/block-handle/index.ts` | Barrel export. |
| `components/editor/slash-command/slash-command-extension.ts` | Tiptap Extension using `Suggestion` plugin (copy Mention pattern from `extensions.ts:119-196`). |
| `components/editor/slash-command/slash-command-list.tsx` | React: grouped items, filtering, keyboard nav, `ReactRenderer`. |
| `components/editor/slash-command/slash-command-items.ts` | Static command definitions with groups. |
| `components/editor/slash-command/index.ts` | Barrel export. |
| `components/editor/extensions/callout.ts` | Custom Tiptap Node + `CalloutView.tsx` NodeViewRenderer. |
| `components/editor/extensions/toggle.ts` | Custom Tiptap Node + `ToggleView.tsx` NodeViewRenderer. |
| `stores/block-handle.ts` | Zustand: `{ hoveredBlockPos, contextMenuAnchor, selectedBlocks }` |
| `components/editor/block-handle/sortable-block.tsx` | `useSortable()` React wrapper for each top-level block. Used as NodeViewRenderer. |
| `components/editor/extensions/columns.ts` | Custom Tiptap Node for columns layout + `ColumnView.tsx` NodeViewRenderer. |
| `components/editor/extensions/callout-emoji-picker.tsx` | Emoji picker popover inside `CalloutView`. Uses `@emoji-mart/react`. |
| `lib/editor/slash-command-search.ts` | Fuzzy scorer + recently-used tracker (localStorage). |

**Files to DELETE:**
- `components/editor/block-handle.tsx` → replaced by `block-handle/` directory
- `components/editor/slash-command.tsx` → replaced by `slash-command/` directory

**Files to MODIFY:**

| File | Change |
|------|--------|
| `components/editor/extensions.ts` | Remove old `BlockHandleExtension` import. Add `BlockHandlePlugin`, `SlashCommandExtension`, `CalloutNode`, `ToggleNode`. Update Placeholder config. |
| `components/editor/collaborative-editor.tsx` | Remove `<SlashCommandMenu>`. Add `<BlockHandleView>`, `<BlockContextMenu>`. Guard against `editor === null` (`immediatelyRender: false`). |
| `app/globals.css` | Add all new keyframes + block selection CSS. |

**Pitfalls:**
1. **Use `@dnd-kit` for block reorder** — required to reach 9/10 drag UX. Key integration challenge: wrap each top-level block in a `useSortable()` React NodeView. Watch out for nested lists and tables — only top-level blocks are sortable; content inside blocks is NOT. The `SortableContext` items array must stay in sync with ProseMirror document structure via a plugin that emits block positions on `docChanged`.
2. **Two editors exist** (`collaborative-editor.tsx` + any standalone block editor). All shared logic must be in the extension/plugin layer, not the component layer.
3. **`immediatelyRender: false`** — `editor` is `null` on first render. All `BlockHandleView` and `BlockContextMenu` components must guard `if (!editor) return null`.
4. **Block color attrs need to be in node specs** for Yjs to sync them automatically through `y-prosemirror`.
5. **Content padding**: At `px-24` (96px), handles at `left: -52px` have 44px clearance. On mobile (`px-4` = 16px), handles must be hidden or use long-press trigger.

---

#### TDD Steps

- [ ] **RED:** Test `BlockHandlePlugin` emits `hoveredBlockPos` when mouse enters top-level block
- [ ] **RED:** Test `BlockHandleView` renders `+` and drag buttons at correct position
- [ ] **RED:** Test vertical center alignment: first-line centering for H1 vs paragraph
- [ ] **GREEN:** Implement `BlockHandlePlugin` + `BlockHandleView` with Zustand store
- [ ] **REFACTOR:** Extract first-line height calculation into utility function
- [ ] **RED:** Test clicking drag handle opens `BlockContextMenu` with 7 items
- [ ] **RED:** Test Delete action removes block from editor
- [ ] **RED:** Test Duplicate inserts copy immediately after block
- [ ] **RED:** Test "Turn into Heading 1" converts paragraph to h1 (preserves text)
- [ ] **RED:** Test Color submenu applies text color attr to block node
- [ ] **GREEN:** Implement `BlockContextMenu` + `TurnIntoMenu` + `ColorPickerMenu` (React components, `position: fixed`)
- [ ] **REFACTOR:** Extract submenu positioning logic (viewport-aware) into shared utility
- [ ] **RED:** Test clicking drag handle without dragging creates `NodeSelection`
- [ ] **RED:** Test `Escape` deselects block
- [ ] **RED:** Test `Shift+Click` extends selection to range
- [ ] **GREEN:** Implement block selection via `NodeSelection` dispatch
- [ ] **RED:** Test typing `/` opens slash command popup (Tiptap Suggestion)
- [ ] **RED:** Test typing `/hea` filters to Heading 1/2/3 only
- [ ] **RED:** Test `ArrowDown` → `ArrowUp` → `Enter` executes correct command
- [ ] **RED:** Test `Escape` dismisses and leaves `/query` text
- [ ] **RED:** Test `Backspace` on empty query dismisses and deletes the `/`
- [ ] **GREEN:** Implement `SlashCommandExtension` + `SlashCommandList` (copy Mention pattern)
- [ ] **REFACTOR:** Delete old `slash-command.tsx`, remove all `SlashCommandMenu` references
- [ ] **RED:** Test inserted block receives `.block-just-created` class
- [ ] **RED:** Test class removed after 200ms
- [ ] **GREEN:** Implement block creation animation tracking in plugin
- [ ] **RED:** Test slash command "Callout" inserts callout node with emoji attr
- [ ] **RED:** Test callout renders emoji + editable content, emoji click opens picker
- [ ] **RED:** Test slash command "Toggle" inserts toggle node
- [ ] **RED:** Test clicking toggle triangle collapses/expands nested content
- [ ] **GREEN:** Implement `CalloutNode` + `ToggleNode` with React NodeViews
- [ ] **REFACTOR:** Ensure all block interaction code uses DESIGN.md CSS vars exclusively (no hardcoded colors)
- [ ] **RED:** Test @dnd-kit `onDragEnd` dispatches correct ProseMirror move transaction (block reorder)
- [ ] **RED:** Test drag produces ghost element (clone) + source placeholder (opacity 0.25)
- [ ] **RED:** Test keyboard Space picks up block, ArrowDown moves, Space drops
- [ ] **RED:** Test Escape during keyboard reorder returns block to original position
- [ ] **GREEN:** Implement `SortableBlock` NodeView + `DndContext` wrapper + onDragEnd → PM transaction
- [ ] **REFACTOR:** Extract @dnd-kit index ↔ ProseMirror position mapping into utility
- [ ] **RED:** Test slash command fuzzy search: "/hea" ranks "Heading 1" above "Math equation" with "expression"
- [ ] **RED:** Test recently used section appears when query is empty after 1 command used
- [ ] **GREEN:** Implement fuzzy scorer + localStorage recently-used tracker
- [ ] **RED:** Test keyboard nav in context menu: ArrowDown, ArrowUp, Enter execute correct item
- [ ] **RED:** Test "Move to page" submenu searches pages and dispatches block move
- [ ] **GREEN:** Add keyboard navigation (role="menu", ArrowDown/Up, Enter, Escape) to `BlockContextMenu`
- [ ] **RED:** Test Escape from text cursor selects current block (NodeSelection)
- [ ] **RED:** Test ArrowDown/Up navigates between selected blocks
- [ ] **RED:** Test Backspace on selected block deletes it (with fade-out animation)
- [ ] **GREEN:** Add keyboard selection keymap to ProseMirror plugin
- [ ] **RED:** Test callout emoji click opens picker, selecting emoji updates block attr
- [ ] **GREEN:** Implement `CalloutEmojiPicker` using `@emoji-mart/react`
- [ ] **RED:** Test columns slash command inserts 2-column block
- [ ] **RED:** Test each column is independently editable
- [ ] **RED:** Test "+" button adds 3rd column, up to max 5
- [ ] **GREEN:** Implement `ColumnsNode` + `ColumnView` with resize handles
- [ ] **RED:** Test nested toggle renders inside parent toggle
- [ ] **RED:** Test toggle open/close CSS transition (`max-height`) animates smoothly
- [ ] **GREEN:** Verify toggle `content: 'paragraph block*'` schema allows nesting
- [ ] **RED:** Test block color persists through "Turn into" conversion
- [ ] **GREEN:** Include `textColor` + `backgroundColor` attrs in ALL block node specs
- [ ] **RED:** Write `e2e/block-ux.spec.ts` — test: hover shows handle, click opens menu, delete works, slash fuzzy search, recently used, drag reorder, Callout emoji picker, Columns, nested Toggle
- [ ] **GREEN:** All e2e tests pass
- [ ] **SCORE CHECK:** Manually verify each element against scorecard — all items must reach 9/10 before Task 0 is considered complete

#### Implementation Notes

- Slash command must delete the `/query` text before executing the command. Tiptap's Suggestion plugin handles this via `command({ editor, range, props })` — call `editor.chain().focus().deleteRange(range).run()` then the block conversion command.
- Block colors stored as ProseMirror node attrs. All new block node specs (`callout`, `toggle`) must include `{ textColor: { default: null }, backgroundColor: { default: null } }` attrs. Apply as inline styles in NodeView.
- The `+ ` button triggers the slash menu programmatically. After inserting a new empty paragraph, dispatch a `/` character via `editor.chain().insertContent('/').run()` — the Suggestion plugin will pick it up.
- For the drag ghost (HTML5 drag): on `dragstart`, create a clone of the block DOM element via `node.cloneNode(true)`, append offscreen (`position: absolute; left: -9999px`), use `e.dataTransfer.setDragImage(clone, 0, 0)`. Clean up on `dragend`.
- The selection toolbar conflicts with `EditorBubbleMenu` — both are `position: fixed` overlays. Only one should be visible at a time: show selection toolbar when blocks are selected, bubble menu when text is selected. Implement mutual exclusion via editor selection type check (`selection instanceof NodeSelection ? showBlockToolbar : showBubbleMenu`).

---

## P0 -- Critical Features

---

### Task 1: Forms (Form Builder + Database-Linked Submission)

**Priority:** P0
**Estimated complexity:** High
**Dependencies:** None (standalone feature)

#### Context

Forms are completely missing. In Notion, a Form is a specialized view of a database -- each form field maps to a database property. When someone submits a form, a new row is created in the linked database. Forms have a shareable public URL that works without authentication.

#### Schema Changes

Add to `schema.prisma`:

```prisma
model Form {
  id          String   @id @default(cuid())
  databaseId  String   @map("database_id")
  name        String   @default("Untitled Form")
  description String?
  coverUrl    String?  @map("cover_url")

  // Field configuration: ordered array of { propertyId, label?, description?, required, hidden }
  fields      Json     @default("[]")

  // Submission settings
  submitLabel     String  @default("Submit") @map("submit_label")
  successMessage  String  @default("Your response has been recorded.") @map("success_message")

  // Sharing
  shareToken  String   @unique @default(cuid()) @map("share_token")
  isPublic    Boolean  @default(false) @map("is_public")
  acceptingResponses Boolean @default(true) @map("accepting_responses")

  createdBy   String   @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([databaseId])
  @@index([shareToken])
  @@map("forms")
}

model FormSubmission {
  id        String   @id @default(cuid())
  formId    String   @map("form_id")
  rowId     String   @map("row_id")   // The database row created by this submission
  metadata  Json     @default("{}")    // IP, user-agent, timestamp etc.
  createdAt DateTime @default(now()) @map("created_at")

  @@index([formId, createdAt])
  @@map("form_submissions")
}
```

#### API Changes

Create `notion/apps/api/src/routes/forms.ts`:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/v1/databases/:databaseId/forms` | Create a form for a database |
| `GET` | `/api/v1/databases/:databaseId/forms` | List forms for a database |
| `GET` | `/api/v1/forms/:formId` | Get form config (authenticated) |
| `PATCH` | `/api/v1/forms/:formId` | Update form fields/settings |
| `DELETE` | `/api/v1/forms/:formId` | Delete a form |
| `GET` | `/api/v1/forms/public/:shareToken` | Get form for public submission (no auth) |
| `POST` | `/api/v1/forms/public/:shareToken/submit` | Submit form response (no auth) |
| `GET` | `/api/v1/forms/:formId/submissions` | List submissions for a form |

Modify `notion/apps/api/src/index.ts`:
- Import and mount `forms` route: `api.route('/forms', forms)` and `api.route('/databases/:databaseId/forms', databaseForms)`

#### Shared Types

Create `notion/packages/shared/src/form.ts`:

```typescript
export interface FormField {
  propertyId: string;       // Maps to database PropertyDefinition.id
  label?: string;           // Override property name
  description?: string;     // Help text shown below field
  required: boolean;
  hidden: boolean;          // Hidden fields get default values
  defaultValue?: unknown;
  position: number;
}

export interface FormConfig {
  id: string;
  databaseId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  fields: FormField[];
  submitLabel: string;
  successMessage: string;
  shareToken: string;
  isPublic: boolean;
  acceptingResponses: boolean;
}

export interface FormSubmissionData {
  values: Record<string, unknown>;  // propertyId -> value
}
```

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/form/form-builder.tsx` -- Drag-and-drop field reordering (using @dnd-kit already in deps). Left panel = field list with toggle required/hidden; right panel = live preview. Each field renders a control matching the database property type.
- `notion/apps/web/src/components/form/form-field.tsx` -- Renders a single form field based on property type. Reuses logic from `property-cell.tsx` but with form-appropriate styling (full-width input, labels, descriptions, validation indicators).
- `notion/apps/web/src/components/form/form-preview.tsx` -- Read-only preview of the form as a submitter would see it.
- `notion/apps/web/src/components/form/form-submission-view.tsx` -- Public page rendered at `/form/:token`. Fetches form config from the unauthenticated endpoint. Renders fields, validates required, POSTs submission.
- `notion/apps/web/src/components/form/form-responses.tsx` -- Table of submissions with timestamps, links to created rows.
- `notion/apps/web/src/stores/form.ts` -- Zustand store: `loadForm`, `updateField`, `reorderFields`, `submitForm`, `loadSubmissions`.
- `notion/apps/web/src/app/(public)/form/[token]/page.tsx` -- Next.js page for the public form URL (outside auth layout).
- `notion/apps/web/src/app/(app)/workspace/[workspaceId]/form/[formId]/page.tsx` -- Authenticated form builder page.

**Modify:**
- `notion/apps/web/src/components/database/database-view.tsx` -- Add "Form" button next to view tabs that opens form builder or lists existing forms.

#### TDD Steps

- [ ] **RED:** Write `apps/api/src/__tests__/forms.test.ts` -- test `POST /databases/:id/forms` returns 201 with fields auto-populated from database schema
- [ ] **RED:** Test `GET /forms/public/:token` returns form config without auth
- [ ] **RED:** Test `POST /forms/public/:token/submit` creates a database row with correct property values
- [ ] **RED:** Test submission fails with 400 when required field is missing
- [ ] **RED:** Test submission fails with 403 when `acceptingResponses` is false
- [ ] **GREEN:** Implement Form model migration, route handlers, submission logic
- [ ] **REFACTOR:** Extract form-field-to-property-value mapper into shared utility
- [ ] **RED:** Write `e2e/forms.spec.ts` -- test form builder loads, fields can be reordered, public URL works
- [ ] **GREEN:** Implement frontend components (form-builder, form-field, form-submission-view, stores)
- [ ] **REFACTOR:** Extract validation logic (required check, type coercion) into `packages/shared/src/form.ts`

#### Implementation Notes

- Form fields auto-initialize from database schema properties -- creating a form for a database with 5 properties gives 5 form fields.
- The public submission route (`/forms/public/:token/submit`) must bypass the JWT auth middleware. Use a separate Hono sub-app or explicitly skip auth for this path prefix.
- Submission creates a database row using the same `createRow` logic from `databases.ts`. Extract that into a shared function.
- Auto-properties (`created_time`, `created_by`, `formula`, `rollup`) should be excluded from form fields (they are computed).
- Consider rate-limiting the public submission endpoint more aggressively (e.g., 10 req/min per IP).

---

### Task 2: Sprints (Sprint Model, Planning Board, Backlog)

**Priority:** P0
**Estimated complexity:** High
**Dependencies:** None (standalone feature, but benefits from database infrastructure)

#### Context

Sprints are completely missing. In Notion's project management, sprints are time-boxed iterations configurable per database. Each database can have sprint configuration (duration 1-8 weeks, start day). Rows have a Sprint property that assigns them to a sprint. A Sprint Planning view shows the active sprint, upcoming sprint, and backlog.

#### Schema Changes

Add to `schema.prisma`:

```prisma
model SprintConfig {
  id          String   @id @default(cuid())
  databaseId  String   @unique @map("database_id")  // One config per database
  duration    Int      @default(2)                    // Weeks (1-8)
  startDay    Int      @default(1)                    // 0=Sun, 1=Mon, ..., 6=Sat
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  sprints Sprint[]

  @@map("sprint_configs")
}

model Sprint {
  id            String       @id @default(cuid())
  configId      String       @map("config_id")
  name          String                                // e.g. "Sprint 5"
  goal          String?
  startDate     DateTime     @map("start_date")
  endDate       DateTime     @map("end_date")
  status        SprintStatus @default(planned)
  position      Int          @default(0)
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  config SprintConfig @relation(fields: [configId], references: [id], onDelete: Cascade)

  @@index([configId, status])
  @@index([configId, startDate])
  @@map("sprints")
}

enum SprintStatus {
  planned
  active
  completed

  @@map("sprint_status")
}
```

Sprint assignment is stored as a property value on each database row: the `sprint` property type (new) stores a Sprint ID. This follows Notion's pattern of property-based metadata.

Add `'sprint'` to the `PropertyType` union in `packages/shared/src/database.ts`:

```typescript
// Add to PropertyType
| 'sprint'

// Add to PropertyValue union
| { type: 'sprint'; value: string | null }  // sprint id
```

#### API Changes

Create `notion/apps/api/src/routes/sprints.ts`:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/v1/databases/:databaseId/sprints/config` | Create/update sprint config for a database |
| `GET` | `/api/v1/databases/:databaseId/sprints/config` | Get sprint config |
| `GET` | `/api/v1/databases/:databaseId/sprints` | List all sprints for a database |
| `POST` | `/api/v1/databases/:databaseId/sprints` | Create a new sprint |
| `PATCH` | `/api/v1/sprints/:sprintId` | Update sprint (name, dates, status, goal) |
| `DELETE` | `/api/v1/sprints/:sprintId` | Delete a sprint (moves items to backlog) |
| `POST` | `/api/v1/sprints/:sprintId/start` | Start a sprint (sets status=active, validates no other active) |
| `POST` | `/api/v1/sprints/:sprintId/complete` | Complete a sprint (moves incomplete items to next sprint or backlog) |
| `GET` | `/api/v1/databases/:databaseId/sprints/backlog` | Get backlog items (rows with no sprint assigned) |

#### Shared Types

Create `notion/packages/shared/src/sprint.ts`:

```typescript
export type SprintStatus = 'planned' | 'active' | 'completed';

export interface SprintConfig {
  id: string;
  databaseId: string;
  duration: number;     // weeks 1-8
  startDay: number;     // 0-6 (Sunday-Saturday)
}

export interface Sprint {
  id: string;
  configId: string;
  name: string;
  goal?: string;
  startDate: string;    // ISO date
  endDate: string;      // ISO date
  status: SprintStatus;
  position: number;
  itemCount?: number;   // Computed: rows assigned to this sprint
  completedCount?: number; // Computed: rows with status=done in this sprint
}
```

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/sprint/sprint-board.tsx` -- Three-column layout: Active Sprint | Next Sprint | Backlog. Each column shows assigned rows as cards. Drag-and-drop between columns to reassign sprint. Active sprint shows progress bar (completed/total).
- `notion/apps/web/src/components/sprint/sprint-config.tsx` -- Modal for configuring sprint duration and start day. Auto-generates next sprint dates based on config.
- `notion/apps/web/src/components/sprint/sprint-header.tsx` -- Shows active sprint name, date range, goal, countdown, and Start/Complete buttons.
- `notion/apps/web/src/components/sprint/backlog-view.tsx` -- List of un-sprinted items with bulk "Move to Sprint" action.
- `notion/apps/web/src/stores/sprint.ts` -- Zustand store: `loadConfig`, `loadSprints`, `createSprint`, `startSprint`, `completeSprint`, `moveItem`.

**Modify:**
- `notion/apps/web/src/components/database/database-view.tsx` -- Add `sprint` to the `ViewType` selection grid. When sprint view is active, render `SprintBoard` instead of table/board/etc.
- `notion/apps/web/src/components/sidebar/sidebar.tsx` -- Show "Active Sprint" indicator under database entries that have sprint configs.
- `notion/packages/shared/src/database.ts` -- Add `'sprint'` to `ViewType` union.
- `notion/apps/api/prisma/schema.prisma` -- Add `sprint` to `ViewType` enum.

#### TDD Steps

- [ ] **RED:** Write `apps/api/src/__tests__/sprints.test.ts` -- test creating sprint config returns 201 with duration/startDay
- [ ] **RED:** Test creating a sprint auto-calculates endDate from config duration
- [ ] **RED:** Test `POST /sprints/:id/start` fails if another sprint is already active
- [ ] **RED:** Test `POST /sprints/:id/complete` moves incomplete items to next planned sprint
- [ ] **RED:** Test backlog endpoint returns only rows with null sprint property
- [ ] **GREEN:** Implement Sprint models, migration, route handlers
- [ ] **REFACTOR:** Extract sprint date calculation into `packages/shared/src/sprint.ts`
- [ ] **RED:** Write `e2e/sprints.spec.ts` -- test sprint board renders, items can be dragged between sprints
- [ ] **GREEN:** Implement frontend components
- [ ] **REFACTOR:** Consolidate row-card rendering between sprint-board and board-view

#### Implementation Notes

- Sprint assignment is implemented as a special property type `sprint` on each row, not as a separate join table. This keeps it consistent with the existing "everything is a property" pattern.
- When creating a SprintConfig for a database, automatically add a `sprint` property to the database schema if one does not exist.
- The "Complete Sprint" action should prompt: move incomplete items to (a) next planned sprint, (b) backlog, or (c) new sprint.
- Sprint view in the `ViewType` enum requires a new Prisma migration for the enum change. Use `ALTER TYPE view_type ADD VALUE 'sprint';` in a custom SQL migration.
- Auto-generate sprint names sequentially: "Sprint 1", "Sprint 2", etc.

---

### Task 3: Automations Completion (Missing Triggers + Actions)

**Priority:** P0
**Estimated complexity:** Medium
**Dependencies:** Task 1 (Forms) for `page_added` trigger from form submissions

#### Context

Current state: 2 triggers (`status_change`, `item_created`) and 2 actions (`send_notification`, `update_property`). Missing: `page_added` trigger, `property_edited` (general), `recurring` trigger; Missing actions: `add_page_to`, `edit_pages_in`, `send_mail`, `send_webhook`, `send_slack`, `define_variables`.

#### Schema Changes

No new models needed. The existing `Automation` model stores triggers and actions as JSON, which is flexible enough. However, we need a new model for recurring trigger scheduling:

Add to `schema.prisma`:

```prisma
model AutomationSchedule {
  id            String   @id @default(cuid())
  automationId  String   @unique @map("automation_id")
  cronExpression String  @map("cron_expression")  // e.g. "0 9 * * 1" for Monday 9am
  timezone      String   @default("UTC")
  lastRunAt     DateTime? @map("last_run_at")
  nextRunAt     DateTime? @map("next_run_at")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([nextRunAt])
  @@map("automation_schedules")
}
```

#### API Changes

Modify `notion/apps/api/src/routes/automations.ts`:

- Extend `TriggerSchema` with 3 new discriminated union members:
  ```
  page_added     -- config: { databaseId, source?: 'form' | 'manual' | 'any' }
  property_edited -- config: { databaseId, propertyId, fromValue?, toValue? }
  recurring      -- config: { cronExpression, timezone }
  ```
- Extend `ActionSchema` with 6 new discriminated union members:
  ```
  add_page_to    -- config: { targetDatabaseId, values }
  edit_pages_in  -- config: { databaseId, filterConditions, updates }
  send_mail      -- config: { to, subject, body } (template variables)
  send_webhook   -- config: { url, method, headers, body }
  send_slack     -- config: { webhookUrl, message }
  define_variables -- config: { variables: Record<string, expression> }
  ```

Create action handler files in `notion/apps/api/src/lib/automation-actions/`:

- `send-mail.ts` -- Uses nodemailer or a configured SMTP transport
- `send-webhook.ts` -- HTTP fetch with retry logic
- `send-slack.ts` -- Posts to Slack incoming webhook URL
- `add-page-to.ts` -- Creates a row in a target database
- `edit-pages-in.ts` -- Batch updates rows matching filter conditions
- `define-variables.ts` -- Evaluates expressions, makes results available to subsequent actions

Create `notion/apps/api/src/lib/automation-scheduler.ts`:
- BullMQ repeatable job that runs every minute
- Queries `AutomationSchedule` where `nextRunAt <= now()`
- Fires the automation's actions
- Updates `lastRunAt` and calculates `nextRunAt`

Modify `notion/apps/api/src/lib/queue.ts`:
- Add `automationQueue` for scheduled automation jobs

Modify `notion/apps/api/src/lib/automation-engine.ts`:
- Add `checkAutomationsOnPropertyEdit()` for the general `property_edited` trigger
- Add `checkAutomationsOnPageAdd()` for `page_added` trigger (called from form submission and row creation)
- Add `executeAction()` cases for all 6 new action types, delegating to the individual handler files

#### Frontend Changes

**Modify:**
- The existing automation UI (if any) in the web app needs extension. Based on the route file, there is likely a minimal automation panel. Add action type selectors for the 6 new types and trigger type selectors for the 3 new triggers.
- Each new action type needs a configuration form (e.g., webhook URL + method for `send_webhook`, email fields for `send_mail`, cron picker for `recurring`).

#### TDD Steps

- [ ] **RED:** Write `apps/api/src/__tests__/automations.test.ts` -- test `property_edited` trigger fires when any property changes (not just status)
- [ ] **RED:** Test `page_added` trigger fires when a row is created via form submission
- [ ] **RED:** Test `send_webhook` action makes HTTP POST to configured URL with correct payload
- [ ] **RED:** Test `send_slack` action posts to Slack webhook URL
- [ ] **RED:** Test `add_page_to` action creates a row in the target database with mapped values
- [ ] **RED:** Test `edit_pages_in` action updates all rows matching filter conditions
- [ ] **RED:** Test `define_variables` makes computed values available to subsequent actions
- [ ] **RED:** Test recurring trigger scheduler fires at configured cron time
- [ ] **GREEN:** Implement all trigger types, action handlers, scheduler
- [ ] **REFACTOR:** Unify action execution into a pipeline pattern (define_variables -> other actions)

#### Implementation Notes

- `define_variables` must execute FIRST in the action chain. The automation engine should sort actions so variable definitions come before consumers. Variables are available as `{{variable_name}}` in subsequent action configs.
- Template variables in action configs: `{{row.title}}`, `{{row.property_name}}`, `{{trigger.old_value}}`, `{{trigger.new_value}}`, `{{now}}`. Parse these with a simple regex replacer.
- `send_mail` requires SMTP configuration. Store in environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- The recurring trigger scheduler should use BullMQ's `repeat` option rather than polling. Register a repeatable job when an automation with `recurring` trigger is created; remove it when the automation is deleted or deactivated.
- `edit_pages_in` reuses the filter evaluation logic already present in `databases.ts`. Extract it into a shared utility.
- For `send_webhook`, implement exponential backoff retry (3 attempts, 1s/4s/16s delays).

---

## P1 -- High Value Features

---

### Task 4: AI Autofill (Claude API Integration)

**Priority:** P1
**Estimated complexity:** High
**Dependencies:** None

#### Context

AI features are completely missing. The spec calls for: AI Autofill (summary, keyword extraction, categorization, translation, custom prompts), AI database query (natural language to filter), and Formula AI (natural language to formula expression). Use `claude-haiku-4-5` for cost efficiency with streaming responses via SSE.

#### Schema Changes

Add to `schema.prisma`:

```prisma
model AiUsageLog {
  id          String   @id @default(cuid())
  workspaceId String   @map("workspace_id")
  userId      String   @map("user_id")
  feature     String                          // 'autofill' | 'query' | 'formula'
  model       String   @default("claude-haiku-4-5")
  inputTokens Int      @default(0) @map("input_tokens")
  outputTokens Int     @default(0) @map("output_tokens")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([workspaceId, createdAt])
  @@map("ai_usage_logs")
}
```

#### API Changes

Create `notion/apps/api/src/routes/ai.ts`:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/v1/ai/autofill` | Generate property value for a row (streaming SSE) |
| `POST` | `/api/v1/ai/query` | Natural language to database filter |
| `POST` | `/api/v1/ai/formula` | Natural language to formula expression |
| `GET` | `/api/v1/ai/usage` | Get AI usage stats for workspace |

Create `notion/apps/api/src/lib/ai-service.ts`:

```typescript
// Core AI service wrapping Claude API via @anthropic-ai/sdk
export class AiService {
  // Autofill: given a row's context + target property, generate a value
  async autofill(params: AutofillRequest): AsyncGenerator<string>

  // Query: convert natural language to FilterGroup
  async query(params: QueryRequest): Promise<FilterGroup>

  // Formula: convert description to formula expression
  async formula(params: FormulaRequest): Promise<string>
}
```

**Autofill request body:**
```json
{
  "databaseId": "...",
  "rowId": "...",
  "targetPropertyId": "...",
  "mode": "summary" | "keywords" | "categorize" | "translate" | "custom",
  "customPrompt": "...",           // Only when mode=custom
  "sourcePropertyIds": ["..."],    // Which properties to use as context
  "language": "en"                 // For translate mode
}
```

The autofill endpoint streams via SSE: the client receives incremental text tokens, then the final property value as a JSON event.

**Query request body:**
```json
{
  "databaseId": "...",
  "query": "show me tasks assigned to John due this week"
}
```

Returns a `FilterGroup` object that can be directly applied to a view.

**Formula request body:**
```json
{
  "databaseId": "...",
  "description": "calculate the total price by multiplying quantity and unit price"
}
```

Returns a formula expression string compatible with the existing formula parser.

#### Shared Types

Create `notion/packages/shared/src/ai.ts`:

```typescript
export type AiAutofillMode = 'summary' | 'keywords' | 'categorize' | 'translate' | 'custom';

export interface AutofillRequest {
  databaseId: string;
  rowId: string;
  targetPropertyId: string;
  mode: AiAutofillMode;
  customPrompt?: string;
  sourcePropertyIds?: string[];
  language?: string;
}

export interface AiQueryRequest {
  databaseId: string;
  query: string;
}

export interface AiFormulaRequest {
  databaseId: string;
  description: string;
}
```

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/ai/ai-autofill-menu.tsx` -- Appears as an option in the property cell context menu (right-click or hover action). Shows mode selection (Summary, Keywords, Categorize, Translate, Custom). On click, calls the SSE endpoint and streams the result into the cell. Shows a shimmer animation during generation.
- `notion/apps/web/src/components/ai/ai-query-bar.tsx` -- A search-like input at the top of database views. User types natural language, presses Enter, API returns a FilterGroup, which is applied to the active view. Shows "AI Filter active" badge that can be cleared.
- `notion/apps/web/src/components/ai/ai-formula-helper.tsx` -- In the formula editor modal (`formula-editor.tsx`), adds a text input "Describe your formula..." that calls the API and populates the formula expression field.

**Modify:**
- `notion/apps/web/src/components/database/property-cell.tsx` -- Add AI autofill button (sparkle icon) that opens the autofill menu.
- `notion/apps/web/src/components/database/database-view.tsx` -- Add AI query bar above the filter toolbar.
- `notion/apps/web/src/components/database/formula-editor.tsx` -- Add AI formula helper section.

#### TDD Steps

- [ ] **RED:** Write `apps/api/src/__tests__/ai-service.test.ts` -- mock Anthropic SDK, test autofill generates valid property value for 'summary' mode
- [ ] **RED:** Test AI query converts "tasks due this week" to correct FilterGroup with date range
- [ ] **RED:** Test AI formula converts "multiply price by quantity" to `prop("Price") * prop("Quantity")`
- [ ] **RED:** Test autofill SSE endpoint streams tokens then final value
- [ ] **RED:** Test rate limiting: max 20 AI calls per minute per workspace
- [ ] **RED:** Test usage logging records input/output tokens
- [ ] **GREEN:** Implement AiService with Claude API, route handlers, SSE streaming
- [ ] **REFACTOR:** Extract prompt templates into a separate config file for easy tuning
- [ ] **RED:** Write `e2e/ai-autofill.spec.ts` -- test autofill menu appears, generates summary
- [ ] **GREEN:** Implement frontend components

#### Implementation Notes

- Use `@anthropic-ai/sdk` with streaming: `client.messages.stream()`.
- SSE streaming in Hono: use `c.stream()` with `Transfer-Encoding: chunked`. Format: `data: {"type":"token","value":"..."}\n\n` for tokens, `data: {"type":"done","value":{...}}\n\n` for final value.
- Prompt engineering for autofill modes:
  - **Summary:** "Summarize the following content in 1-2 sentences: {row context}"
  - **Keywords:** "Extract 3-5 keywords from: {row context}. Return as comma-separated."
  - **Categorize:** "Given these categories: {select options}. Classify: {row context}. Return only the category name."
  - **Translate:** "Translate the following to {language}: {value}"
  - **Custom:** User-provided prompt with `{value}` placeholder
- For AI Query, send the database schema (property names + types + select options) as context so Claude can generate valid filter conditions.
- For AI Formula, send property names and types so the generated expression references real properties.
- Add `ANTHROPIC_API_KEY` to environment variables.
- Implement token-based rate limiting per workspace (store in Redis): 20 requests/min, 100K tokens/day.
- The `AiUsageLog` model is for observability/cost tracking, not billing (this is a self-hosted tool).

---

### Task 5: Linked Databases (Cross-Database Views)

**Priority:** P1
**Estimated complexity:** Medium
**Dependencies:** None

#### Context

Linked Databases let you create a view of another database with its own independent filters, sorts, and visible properties. In Notion, you can embed a "linked view" of Database A inside Page B, applying different filters than Database A's native views.

#### Schema Changes

Add to `schema.prisma`:

```prisma
model LinkedDatabase {
  id              String   @id @default(cuid())
  sourceDatabaseId String  @map("source_database_id")  // The real database
  hostPageId      String   @map("host_page_id")        // The page containing this linked view
  position        Int      @default(0)
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([hostPageId])
  @@index([sourceDatabaseId])
  @@map("linked_databases")
}
```

The linked database creates its own `DatabaseView` records that reference the source database's ID. This means views are independent but data comes from the source.

#### API Changes

Modify `notion/apps/api/src/routes/databases.ts`:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/v1/databases/:databaseId/link` | Create a linked database reference |
| `GET` | `/api/v1/pages/:pageId/linked-databases` | List linked databases in a page |
| `DELETE` | `/api/v1/linked-databases/:id` | Remove a linked database |

The key insight: linked databases don't duplicate data. They use the same `/databases/:sourceId/rows` endpoint with their own view's filters.

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/database/linked-database-view.tsx` -- Renders like a regular `DatabaseView` but with a header showing "Linked view of {source database name}" and a link icon. The component fetches views from the linked database's own view records.

**Modify:**
- `notion/apps/web/src/components/editor/slash-command.tsx` -- Add "Linked view of database" option that opens a database picker modal. On selection, creates a `LinkedDatabase` and inserts an inline database block.
- `notion/apps/web/src/components/database/database-view.tsx` -- Accept `isLinked` prop to show the linked indicator.

#### TDD Steps

- [ ] **RED:** Write test -- creating a linked database returns source schema and creates independent default view
- [ ] **RED:** Test linked database view filters are independent from source database views
- [ ] **RED:** Test deleting source database cascades to linked database records
- [ ] **RED:** Test creating a row via linked database view adds it to the source database
- [ ] **GREEN:** Implement LinkedDatabase model, routes, frontend wrapper
- [ ] **REFACTOR:** Extract database view rendering into a shared hook to avoid duplication

#### Implementation Notes

- A linked database is essentially a pointer + its own views. The data layer queries the source database, but applies the linked view's filters/sorts.
- When the source database schema changes (property added/removed), linked database views should reflect the change automatically since they reference the same property IDs.
- The slash command "Create linked view" should open a modal listing all databases in the workspace. User picks one, and a linked database block is inserted inline in the editor.

---

### Task 6: Sub-item Dependencies (Timeline Visualization)

**Priority:** P1
**Estimated complexity:** Medium
**Dependencies:** Existing sub-items implementation (already in `sub-items-row.tsx`)

#### Context

Sub-items exist in the codebase (rows with `parentRowId`), but dependency visualization in the timeline view is missing. Dependencies show as arrows between items in the Gantt chart, indicating "Task B cannot start until Task A finishes."

#### Schema Changes

Add a dependency property type to the shared types. Dependencies are stored as a property value on each row:

```typescript
// Add to PropertyType in packages/shared/src/database.ts
| 'dependency'

// Add to PropertyValue union
| { type: 'dependency'; value: DependencyValue[] }

// New type
export interface DependencyValue {
  rowId: string;           // The row this depends on
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
}
```

No Prisma schema changes needed -- dependencies are stored in the row's `properties.values` JSON like any other property.

#### API Changes

Modify `notion/apps/api/src/routes/databases.ts`:
- Add `'dependency'` to the property type enum in `PropertyDefinitionSchema`
- Add validation: dependency values must reference existing rows in the same database
- When a row's date changes, optionally cascade the shift to dependent rows (configurable)

Add endpoint:
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/databases/:databaseId/dependencies` | Get all dependency edges for the database (for timeline rendering) |

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/database/dependency-overlay.tsx` -- SVG overlay on the timeline view that draws arrows between dependent items. Uses the row positions from the timeline layout to calculate arrow start/end points. Arrow styles: straight with arrowhead, color-coded by dependency type.

**Modify:**
- `notion/apps/web/src/components/database/timeline-view.tsx` -- Import and render `DependencyOverlay` on top of the Gantt bars. Add "Add dependency" interaction: Shift+click a bar then click another bar to create a finish-to-start dependency.
- `notion/apps/web/src/components/database/property-cell.tsx` -- Add rendering for `dependency` property type (shows linked row titles as chips).

#### TDD Steps

- [ ] **RED:** Write test -- creating a dependency property and setting a value stores correctly
- [ ] **RED:** Test GET `/databases/:id/dependencies` returns all edges with row positions
- [ ] **RED:** Test circular dependency detection (A->B->C->A should fail)
- [ ] **RED:** Test cascading date shift when a dependency's end date changes
- [ ] **GREEN:** Implement dependency property type, API, overlay component
- [ ] **REFACTOR:** Extract arrow geometry calculation into a pure utility function

#### Implementation Notes

- Circular dependency detection: implement a simple DFS cycle check when adding/updating dependencies.
- The dependency overlay renders as an absolutely-positioned SVG layer over the timeline. It needs to know each row's Y position and each bar's X start/end.
- Arrow rendering: use SVG `<path>` with bezier curves for clean arcs. Color by type: gray for `finish_to_start` (most common), blue for others.
- Cascading date shift is optional and configurable per database. When enabled, moving Task A's end date forward automatically moves Task B's start date by the same delta.

---

## P2 -- Medium Features

---

### Task 7: Dashboard View

**Priority:** P2
**Estimated complexity:** Medium
**Dependencies:** Task 4 (AI) is optional but enhances dashboards with AI-generated insights

#### Context

Dashboard view is a customizable layout of multiple chart/stat widgets drawn from database data. Think of it as a page of charts, counters, and summaries.

#### Schema Changes

Add `'dashboard'` to the `ViewType` enum in Prisma and shared types. The dashboard layout is stored in the view's `config` JSON:

```typescript
// In ViewConfig, add:
dashboardWidgets?: DashboardWidget[];

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'number' | 'list' | 'progress';
  title: string;
  position: { x: number; y: number; w: number; h: number }; // Grid coordinates
  config: ChartWidgetConfig | NumberWidgetConfig | ListWidgetConfig | ProgressWidgetConfig;
}
```

#### API Changes

No new routes needed. Dashboard is a view type that uses existing view CRUD endpoints. The `config` field stores the widget layout.

Add `'dashboard'` to `ViewType` enum in `schema.prisma` (requires migration).

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/database/dashboard-view.tsx` -- CSS Grid-based layout (12 columns). Each widget is a resizable/draggable tile using @dnd-kit. Widget types:
  - **Chart:** Reuses `ChartView` logic (bar/line/pie)
  - **Number:** Single aggregated value with label (e.g., "Total Revenue: $45,230")
  - **List:** Top N rows sorted by a property
  - **Progress:** Progress bar showing percentage (e.g., completed tasks / total)

**Modify:**
- `notion/apps/web/src/components/database/database-view.tsx` -- Add `dashboard` to view type grid and render `DashboardView` component.
- `notion/packages/shared/src/database.ts` -- Add `'dashboard'` to `ViewType`.

#### TDD Steps

- [ ] **RED:** Test creating a dashboard view stores widget config correctly
- [ ] **RED:** Test number widget computes correct aggregation (sum, avg, count)
- [ ] **RED:** Test progress widget calculates percentage from status property
- [ ] **GREEN:** Implement dashboard view component with 4 widget types
- [ ] **REFACTOR:** Extract widget computation into shared hooks

#### Implementation Notes

- The dashboard is essentially a collection of mini-views with independent aggregation configs. Reuse the existing chart computation logic from `chart-view.tsx`.
- Widget positioning: use a simple grid system (12 columns, row-auto). Store positions as `{x, y, w, h}` grid coordinates.
- Consider using `react-grid-layout` for drag-resize, but evaluate bundle size first. The @dnd-kit library already in deps might suffice with custom grid snapping.

---

### Task 8: Backlinks Panel

**Priority:** P2
**Estimated complexity:** Low
**Dependencies:** None (mentions infrastructure exists)

#### Context

Mentions exist in the editor, but there is no backlinks panel showing "which pages link to this page." In Notion, every page shows backlinks at the top of the content area.

#### API Changes

Modify `notion/apps/api/src/routes/mentions.ts` or create a new endpoint:

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/pages/:pageId/backlinks` | Get all pages that mention this page |

Implementation: Query blocks where `content` JSON contains a mention reference to the target page ID. This can use a PostgreSQL JSONB containment query or Meilisearch.

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/editor/backlinks-panel.tsx` -- Collapsible section at the top of the page editor showing "N backlinks". Expands to show a list of linking pages with their titles and a snippet of the context around the mention. Click navigates to the linking page.

**Modify:**
- `notion/apps/web/src/components/editor/collaborative-editor.tsx` -- Mount `BacklinksPanel` above the editor content area.

#### TDD Steps

- [ ] **RED:** Test `/pages/:id/backlinks` returns pages that contain mentions of the target page
- [ ] **RED:** Test backlinks update when a mention is added/removed
- [ ] **GREEN:** Implement API endpoint and frontend panel
- [ ] **REFACTOR:** Add caching (Redis) for backlink counts to avoid expensive JSONB scans

#### Implementation Notes

- The mention format in Tiptap stores the referenced page ID in the mark/node attributes. Query strategy: `SELECT DISTINCT page_id FROM blocks WHERE content::text LIKE '%"pageId":"TARGET_ID"%'`. For better performance, maintain a `mentions` lookup table (or use the existing mention infrastructure).
- Show backlink count in the page header even when collapsed. Only fetch full backlink details when expanded.

---

### Task 9: Presentation Mode

**Priority:** P2
**Estimated complexity:** Low
**Dependencies:** None

#### Context

Presentation mode turns page content into a slideshow where each top-level heading (`heading_1`) or divider becomes a slide break.

#### Frontend Changes

**Create:**
- `notion/apps/web/src/components/database/presentation-view.tsx` -- Full-screen overlay. Parses the page's block tree: splits on `heading_1` or `divider` blocks to create slides. Each slide renders its blocks using the existing block renderer. Navigation: arrow keys, click, swipe. Shows slide counter "3/12". ESC exits.

**Modify:**
- `notion/apps/web/src/components/editor/collaborative-editor.tsx` -- Add "Present" button in the page toolbar that activates presentation mode.

#### TDD Steps

- [ ] **RED:** Test slide splitting logic: 3 heading_1 blocks = 3 slides
- [ ] **RED:** Test keyboard navigation (ArrowRight advances, ArrowLeft goes back, Escape exits)
- [ ] **GREEN:** Implement presentation overlay component
- [ ] **REFACTOR:** Extract slide-splitting logic into a pure function

#### Implementation Notes

- The presentation is purely a frontend feature -- no API changes needed.
- Render slides using the same block rendering components but with larger fonts and centered layout.
- Add slide transition animations (simple fade or slide).
- Consider using `document.fullscreenElement` API for true full-screen presentation.

---

## P3 -- Nice-to-Have

---

### Task 10: Missing Property Types (Button, Unique ID, Place)

**Priority:** P3
**Estimated complexity:** Low
**Dependencies:** None

#### Changes

Add to `PropertyType` in `packages/shared/src/database.ts`:

```typescript
| 'button'      // Triggers an action (e.g., open URL, run automation)
| 'unique_id'   // Auto-incrementing ID with optional prefix (e.g., "TASK-001")
| 'place'       // Geo location { lat, lng, address }
```

Add to `PropertyValue` union:
```typescript
| { type: 'button'; value: { label: string; action: 'open_url' | 'run_automation'; config: Record<string, unknown> } }
| { type: 'unique_id'; value: { prefix: string; number: number } }  // Read-only, auto-assigned
| { type: 'place'; value: { lat: number; lng: number; address: string } | null }
```

**API changes:**
- In `databases.ts`, add `unique_id` to `AUTO_PROPERTIES` (server-managed).
- When a row is created in a database with a `unique_id` property, auto-assign the next sequential number. Use `SELECT MAX(...)` on existing rows or maintain a counter in the database block properties.
- Add `'button'`, `'unique_id'`, `'place'` to the property type enum validation.

**Frontend changes:**
- `property-cell.tsx` -- Add cell renderers:
  - **Button:** Renders as a clickable button that executes the configured action.
  - **Unique ID:** Renders as read-only "PREFIX-NNN" badge.
  - **Place:** Renders as address text with optional map popover (using a simple embed or Leaflet).
- `add-property-menu.tsx` -- Add the 3 new types to the property creation menu.

#### TDD Steps

- [ ] **RED:** Test unique_id auto-increments correctly across row creation
- [ ] **RED:** Test unique_id prefix formatting: "TASK" + 42 = "TASK-042"
- [ ] **RED:** Test button property stores action config and renders
- [ ] **RED:** Test place property validates lat/lng ranges
- [ ] **GREEN:** Implement all three property types
- [ ] **REFACTOR:** Extract unique_id counter logic into a reusable utility

---

### Task 11: View Tab Customization

**Priority:** P3
**Estimated complexity:** Low
**Dependencies:** None

#### Changes

Add to `ViewConfig` in `packages/shared/src/database.ts`:

```typescript
tabDisplay?: 'text_and_icon' | 'text_only' | 'icon_only';
tabIcon?: string;  // Custom icon (emoji or lucide icon name)
```

**Frontend changes:**
- `database-view.tsx` -- In the view tab rendering, check `view.config.tabDisplay` to conditionally show icon, text, or both. Add a right-click context menu on view tabs with options: "Text & Icon", "Text only", "Icon only", "Change icon".

#### TDD Steps

- [ ] **RED:** Test view update with `tabDisplay: 'icon_only'` stores correctly
- [ ] **GREEN:** Implement tab display modes in database-view.tsx
- [ ] **REFACTOR:** Clean up conditional rendering

---

### Task 12: Database Locking

**Priority:** P3
**Estimated complexity:** Low
**Dependencies:** None

#### Changes

Add to database block properties (stored in `properties` JSON):

```typescript
// In DatabaseBlockProperties
locked?: boolean;           // Structure lock: prevents property add/remove/reorder
lockedBy?: string;          // User ID who locked it
lockedAt?: string;          // ISO timestamp
```

**API changes:**
- In `databases.ts`, add `PATCH /databases/:id/lock` and `PATCH /databases/:id/unlock` endpoints.
- When `locked: true`, reject property add/update/delete operations with 403. Row data changes are still allowed.

**Frontend changes:**
- `database-view.tsx` -- Show lock icon in header. When locked, disable property header actions (add, rename, reorder, delete). Show "Locked by {name}" tooltip.

#### TDD Steps

- [ ] **RED:** Test locking prevents property addition
- [ ] **RED:** Test locking does NOT prevent row value updates
- [ ] **RED:** Test only locker or admin can unlock
- [ ] **GREEN:** Implement lock/unlock endpoints and UI
- [ ] **REFACTOR:** Extract permission check into middleware

---

### Task 13: Advanced Filters (Personal vs. Shared, 3-Level Nesting)

**Priority:** P3
**Estimated complexity:** Medium
**Dependencies:** None

#### Changes

The current `FilterGroup` supports `{ logic, conditions }`. Extend to support nested groups:

```typescript
// In packages/shared/src/database.ts, replace FilterGroup:
export interface FilterGroup {
  logic: FilterLogic;
  conditions: (FilterCondition | FilterGroup)[];  // Recursive nesting
  isPersonal?: boolean;   // Personal filters are user-specific, not saved to view
}
```

**API changes:**
- Modify filter evaluation in `databases.ts` to recursively evaluate nested groups (max depth 3).
- Add personal filter storage: `PATCH /databases/:id/views/:viewId/personal-filters` stored per-user (either in a separate model or in `config` keyed by userId).

**Frontend changes:**
- `filter-toolbar.tsx` -- Add "Add filter group" button that creates nested `FilterGroup`. Show nesting visually with indentation and connecting lines. Add "Personal" toggle that marks filters as user-only.

#### TDD Steps

- [ ] **RED:** Test 3-level nested filter evaluates correctly (AND > OR > AND)
- [ ] **RED:** Test personal filters are scoped to user and not visible to others
- [ ] **RED:** Test max nesting depth of 3 is enforced
- [ ] **GREEN:** Implement recursive filter evaluation and nested UI
- [ ] **REFACTOR:** Optimize filter evaluation for large row sets

---

### Task 14: Feed View and Map View

**Priority:** P3
**Estimated complexity:** Medium
**Dependencies:** Task 10 (Place property) for Map View

#### Feed View

An activity-feed style view showing database row changes over time.

Add `'feed'` to `ViewType`. The feed view queries rows ordered by `updatedAt` descending and shows each row as a card with a timestamp and changed properties highlighted.

**Create:**
- `notion/apps/web/src/components/database/feed-view.tsx` -- Vertical timeline layout. Each entry shows: timestamp, row title, which properties changed, old -> new values.

#### Map View

A geographical map view for databases with Place-type properties.

Add `'map'` to `ViewType`. Requires a Place property on the database.

**Create:**
- `notion/apps/web/src/components/database/map-view.tsx` -- Uses Leaflet (open-source) with OpenStreetMap tiles. Each row with a Place value is rendered as a marker. Click marker to see row details in a popup. Add `react-leaflet` to web dependencies.

#### TDD Steps

- [ ] **RED:** Test feed view returns rows ordered by updatedAt with change history
- [ ] **RED:** Test map view requires at least one Place property
- [ ] **RED:** Test map view marker data extraction from rows
- [ ] **GREEN:** Implement both view components
- [ ] **REFACTOR:** Extract change-tracking logic into a shared utility

---

## Cross-Cutting Concerns

### Shared Type System Updates

All new property types and view types must be added in these locations (checklist for every task):

1. `packages/shared/src/database.ts` -- `PropertyType` union, `PropertyValue` union, `ViewType` union
2. `apps/api/prisma/schema.prisma` -- `ViewType` enum (for new view types only)
3. `apps/api/src/routes/databases.ts` -- Zod validation schemas (`PROPERTY_TYPE_ENUM`, `PropertyDefinitionSchema`)
4. `apps/web/src/components/database/property-cell.tsx` -- Cell renderer
5. `apps/web/src/components/database/database-view.tsx` -- View routing
6. `apps/web/src/components/database/add-property-menu.tsx` -- Property type menu
7. `apps/web/src/components/database/filter-toolbar.tsx` -- Filter operators for new types

### Migration Strategy

All schema changes should be in a single Prisma migration per task group:
- **Migration 1 (P0):** Forms, FormSubmission, SprintConfig, Sprint, AutomationSchedule models + ViewType enum extension
- **Migration 2 (P1):** AiUsageLog, LinkedDatabase models
- **Migration 3 (P3):** No model changes (all stored in JSON properties)

Enum extensions in Prisma with PostgreSQL require custom SQL:
```sql
ALTER TYPE view_type ADD VALUE IF NOT EXISTS 'sprint';
ALTER TYPE view_type ADD VALUE IF NOT EXISTS 'dashboard';
ALTER TYPE view_type ADD VALUE IF NOT EXISTS 'feed';
ALTER TYPE view_type ADD VALUE IF NOT EXISTS 'map';
```

### Test Infrastructure

The project uses:
- **Vitest** for unit/integration tests (`pnpm test` / `vitest run`)
- **Playwright** for e2e tests (`pnpm test:e2e`)

For API unit tests, create a test helper in `apps/api/src/__tests__/helpers.ts`:
```typescript
// Creates a test Hono app with mocked Prisma
export function createTestApp() { ... }

// Creates test data (workspace, database, user)
export function seedTestData(prisma: PrismaClient) { ... }
```

For frontend component tests, use Vitest + Testing Library (if added) or Playwright component tests.

### BullMQ Queue Additions

Add to `apps/api/src/lib/queue.ts`:
```typescript
export const automationQueue = new Queue('automations', { connection });
export const aiQueue = new Queue('ai-jobs', { connection });
```

### Environment Variables

New required variables:
```
# Task 3: Automations
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com

# Task 4: AI
ANTHROPIC_API_KEY=
AI_RATE_LIMIT_RPM=20
AI_RATE_LIMIT_TOKENS_DAY=100000
```

---

## Open Questions

See `.omc/plans/open-questions.md` for tracked items.

---

## Execution Order

Recommended implementation sequence (respects dependencies):

```
Phase 0 (Weeks 1-3):  Task 0 (Block UX Fidelity) -- MUST go first. Editor is the product.
                       Block handle rewrite, slash cmd rewrite, selection, animations.
                       Nothing else ships until block UX scores 7/10+.

Phase 1 (Weeks 2-5):  Task 3 (Automations) -- can start in parallel with Phase 0 back-end
Phase 2 (Weeks 3-6):  Task 1 (Forms) -- can start once Block UX + Automations are done
Phase 3 (Weeks 5-7):  Task 2 (Sprints)
Phase 4 (Weeks 6-8):  Task 4 (AI Autofill) -- independent, can run in parallel
Phase 5 (Weeks 7-9):  Task 5 (Linked DBs) + Task 6 (Dependencies)
Phase 6 (Weeks 9-10): Task 7 (Dashboard) + Task 8 (Backlinks)
Phase 7 (Weeks 10-12): Tasks 9-14 (P3 items, can be parallelized)
```

**Why Task 0 first:** Shipping 14 features on top of a janky editor produces a product that users will describe as "a Notion clone that doesn't feel like Notion." The editor quality IS the product. Block UX at 2.5/10 undermines every feature that touches the editor (Backlinks panel, Presentation mode, AI autofill cells). Fix the foundation first.

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Add Task 0: Block UX Fidelity as P0 | Mechanical | P1 (completeness) | Block UX at 2.5/10 — foundational gap absent from original plan | Defer to Phase 2 |
| 2 | CEO | Reorder execution: Block UX before all features | Taste (surfaced at gate) | P1 vs P6 | Editor quality IS the product; features on a janky editor compound the problem | Keep original order |
| 3 | CEO | Slash command rewrite to Tiptap Suggestion | Mechanical | P5 (explicit over clever) | Current impl races with ProseMirror key handling via capture-phase global listener | Keep current |
| 4 | Eng | Tiptap Suggestion for slash cmd (copy Mention pattern at extensions.ts:119-196) | Mechanical | P5 | One correct way; Mention extension already proves the pattern works | Custom approach |
| 5 | Eng | Zustand store for handle/menu state | Mechanical | P4 (DRY) | Already in deps; avoids reinventing shared state | React context |
| 6 | Eng | React portal for context menu (not raw DOM) | Mechanical | P5 | BubbleMenu already does this correctly; consistent pattern | Keep raw DOM |
| 7 | Eng | Use @dnd-kit for drag-and-drop (upgraded from "keep native drag") | Mechanical | P1 (completeness) | 9/10 target requires smooth ghost + surrounding-block animation + keyboard reorder — native HTML5 drag cannot do this | Keep ProseMirror drag |
| 8 | Eng | One decoration for hovered block only (O(1) not O(n)) | Mechanical | P3 | Current impl creates N DOM elements per keystroke — perf bug | Keep current |
| 9 | Design | Block handle: two-button system (+ and ⠿) | Mechanical | P1 | This is core Notion UX — the primary entry point for all block manipulation | Single button |
| 10 | Design | Context menu as React component at `position: fixed` | Mechanical | P5 | Prevents overflow clipping; testable; consistent with existing overlay pattern | Raw DOM |
| 11 | Design | Callout + Toggle as custom NodeViews (Phase 1) | Mechanical | P1 | Missing block types are CRITICAL gaps; slash command already lists them | Defer to Phase 2 |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` Phase 1 | Scope & strategy | 1 | issues_open | Critical gap: Block UX entirely absent from original plan. Premise "features = Notion parity" is incomplete. |
| Design Review | `/autoplan` Phase 2 (opus designer) | UI/UX gaps | 1 | issues_open | Block UX 2.5/10. 7 CRITICAL GAPs identified. Task 0 spec produced (design spec to implementable detail). |
| Eng Review | `/autoplan` Phase 3 | Architecture & tests | 1 | issues_open | O(n) decoration bug, slash cmd race condition, raw DOM menu. All have mechanical fixes. Test plan in Task 0 TDD steps. |
| DX Review | — | Not applicable | 0 | — | — (developer-facing APIs not in scope of this plan) |

**VERDICT:** Plan approved with Task 0 added. Target raised to **9/10** block UX (from 7.3/10). This requires @dnd-kit integration, keyboard-accessible block manipulation, fuzzy slash command with recently-used, emoji picker for callout, columns block, and nested toggles. Implement Task 0 before shipping any of Tasks 1-14. Block UX must score 9/10 before other features ship.

**Cross-phase themes:**
- **Slash command architecture** — flagged by both CEO (wrong pattern causes UX bugs) and Eng (race condition with capture-phase global listener). High-confidence signal: rewrite is non-negotiable.
- **Raw DOM → React overlay pattern** — flagged by Design (untestable, overflow clipping) and Eng (inconsistent with existing BubbleMenu pattern). Mechanical fix.
- **Editor is the product** — both CEO and Design phases independently concluded that block UX quality determines whether the product feels like Notion, regardless of feature count.

Total estimated timeline: **10 weeks** with 1-2 developers working in parallel.
