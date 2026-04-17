# Notion UI 완전 재현 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notion 실제 CSS/인터랙션을 역분석하여 7개 UI 영역 전체를 Notion 수준의 부드럽고 아름다운 UI로 교체한다.

**Architecture:** Phase 1에서 `/browse` 스킬로 notion.so DevTools 값 확보 → `docs/notion-ui-audit.md` 작성. Phase 2에서 `globals.css` 토큰 정비 + 공통 컴포넌트 3개 생성. Phase 3에서 7개 영역 파일 수정 (Task 8~14는 독립적이므로 병렬 실행 가능). Phase 4에서 시각/인터랙션 QA.

**Tech Stack:** Next.js 15, Tailwind CSS v4, CSS Custom Properties, Tiptap v3, TypeScript

---

## 파일 맵

### Phase 2 — Design System (신규 생성)
| 파일 | 역할 |
|------|------|
| `notion/apps/web/src/app/globals.css` | 토큰 값 수정 + .notion-hover 등 유틸 클래스 추가 |
| `notion/apps/web/src/components/ui/NotionMenuItem.tsx` | 신규: 28px 높이 메뉴 아이템 |
| `notion/apps/web/src/components/ui/NotionDropdown.tsx` | 신규: 드롭다운 래퍼 (shadow-menu + 애니메이션) |
| `notion/apps/web/src/components/ui/NotionDivider.tsx` | 신규: 구분선 |

### Phase 3 — 7개 영역 (기존 파일 수정)
| 파일 | 영역 |
|------|------|
| `notion/apps/web/src/components/sidebar/sidebar.tsx` | B — 사이드바 |
| `notion/apps/web/src/components/sidebar/page-tree-item.tsx` | B — 사이드바 |
| `notion/apps/web/src/components/editor/block-handle.tsx` | A — 에디터 |
| `notion/apps/web/src/components/editor/block-handle-overlay.tsx` | A — 에디터 |
| `notion/apps/web/src/components/editor/slash-command-list.tsx` | A — 에디터 |
| `notion/apps/web/src/components/editor/bubble-menu.tsx` | A — 에디터 |
| `notion/apps/web/src/components/editor/block-editor.tsx` | A, F — 에디터/타이포 |
| `notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx` | C — 상단바 |
| `notion/apps/web/src/components/database/table-view.tsx` | E — DB |
| `notion/apps/web/src/components/database/board-view.tsx` | E — DB |
| `notion/apps/web/src/components/database/filter-toolbar.tsx` | E — DB |
| `notion/apps/web/src/components/search-modal.tsx` | G — 모달 |
| `notion/apps/web/src/components/ui/popover.tsx` | G — 모달 |

---

## Task 1: Notion 역분석 → docs/notion-ui-audit.md [Phase 1]

**파일:**
- Create: `docs/notion-ui-audit.md`

- [ ] **Step 1: `/browse` 스킬로 notion.so 접속**

```bash
# 터미널에서
/browse https://www.notion.so
```

브라우저에서 notion.so에 로그인한 뒤, 다음 UI 요소들에서 DevTools (F12 → Elements) 로 CSS를 추출한다.

- [ ] **Step 2: 사이드바 아이템 hover CSS 추출**

Notion 사이드바에서 페이지 아이템 위에 커서를 올린 상태로 DevTools Elements 패널에서 아이템 클래스 확인.
기록할 값: `background-color` (hover), `border-radius`, `transition` property/duration/easing, `padding`, `height`

- [ ] **Step 3: 드롭다운/컨텍스트 메뉴 CSS 추출**

우클릭 컨텍스트 메뉴 또는 `...` 메뉴 열고 DevTools에서 `.notion-overlay-container` 또는 `[data-radix-popper-content-wrapper]` 선택.
기록할 값: `box-shadow`, `border-radius`, `background`, 메뉴 아이템 `height`, `padding`

- [ ] **Step 4: 에디터 블록 hover, 드래그 핸들 CSS 추출**

에디터 블록 위에 커서를 올렸을 때 나타나는 drag handle 요소 DevTools 선택.
기록할 값: `opacity` 트랜지션, `background-color`, `border-radius`, 아이콘 크기

- [ ] **Step 5: 모달/팝오버 CSS 추출**

검색 (Cmd+K) 모달 열고 DevTools에서 모달 컨테이너 선택.
기록할 값: `box-shadow`, `border-radius`, 열림 애니메이션 (animation/transition), `backdrop` 색상

- [ ] **Step 6: notion-ui-audit.md 작성**

```markdown
# Notion UI 실측값 Audit

측정일: 2026-04-17
측정 방법: DevTools Elements + Computed Styles

## 색상
- text-primary: [측정값]
- bg-hover (sidebar item hover): [측정값]
- bg-active: [측정값]
- selection: [측정값]

## 트랜지션
- sidebar item hover bg transition: [측정값] (예: background 20ms ease)
- dropdown open animation: [측정값]
- modal open animation: [측정값]

## 그림자
- context menu box-shadow: [측정값]
- modal box-shadow: [측정값]

## 기타
- sidebar item border-radius: [측정값]
- sidebar item height: [측정값]
- context menu item height: [측정값]
- drag handle opacity transition: [측정값]
```

- [ ] **Step 7: 커밋**

```bash
git add docs/notion-ui-audit.md
git commit -m "docs: Notion DevTools 역분석 실측값 기록"
```

---

## Task 2: globals.css 핵심 토큰 값 수정 [Phase 2]

**파일:**
- Modify: `notion/apps/web/src/app/globals.css`

현재 globals.css의 값이 Notion 실측값보다 연하다. 다음 4가지를 수정한다.

- [ ] **Step 1: --bg-hover opacity 0.04 → 0.08 수정**

`globals.css` 65-102행의 `:root` 블록에서:
```css
/* 변경 전 */
--bg-hover: rgba(55, 53, 47, 0.04);

/* 변경 후 */
--bg-hover: rgba(55, 53, 47, 0.08);
```

- [ ] **Step 2: --bg-active opacity 0.08 → 0.16 수정**

같은 `:root` 블록:
```css
/* 변경 전 */
--bg-active: rgba(55, 53, 47, 0.08);

/* 변경 후 */
--bg-active: rgba(55, 53, 47, 0.16);
```

- [ ] **Step 3: --selection opacity 0.14 → 0.28 수정**

같은 `:root` 블록:
```css
/* 변경 전 */
--selection: rgba(35, 131, 226, 0.14);

/* 변경 후 */
--selection: rgba(35, 131, 226, 0.28);
```

- [ ] **Step 4: --shadow-menu 첫 레이어 opacity 0.05 → 0.1 수정**

```css
/* 변경 전 */
--shadow-menu: 0 0 0 1px rgba(15, 15, 15, 0.05), 0 3px 6px rgba(15, 15, 15, 0.1), 0 9px 24px rgba(15, 15, 15, 0.2);

/* 변경 후 */
--shadow-menu: 0 0 0 1px rgba(15, 15, 15, 0.1), 0 3px 6px rgba(15, 15, 15, 0.1), 0 9px 24px rgba(15, 15, 15, 0.2);
```

- [ ] **Step 5: --text-placeholder 변수 추가 (현재 없음)**

`:root` 블록 `--text-tertiary` 바로 아래에 추가:
```css
--text-tertiary: rgba(55, 53, 47, 0.45);
--text-placeholder: rgba(55, 53, 47, 0.35);   /* ← 추가 */
```

다크모드 `.dark` 블록 `--text-tertiary` 아래에도 추가:
```css
--text-tertiary: rgba(255, 255, 255, 0.35);
--text-placeholder: rgba(255, 255, 255, 0.25);  /* ← 추가 */
```

- [ ] **Step 6: 개발 서버 기동 후 사이드바 hover 색상 시각 확인**

```bash
cd notion/apps/web && npm run dev
```

브라우저에서 http://localhost:3000 접속 → 사이드바 아이템 hover 시 배경색이 이전보다 선명해졌는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add notion/apps/web/src/app/globals.css
git commit -m "style: Notion 실측값 기준 hover/selection/shadow 토큰 강화"
```

---

## Task 3: globals.css — --duration-hover 추가 + .notion-hover 유틸 클래스 [Phase 2]

**파일:**
- Modify: `notion/apps/web/src/app/globals.css`

- [ ] **Step 1: @theme 블록에 --duration-hover 추가**

`globals.css` `@theme` 블록의 `/* Motion */` 섹션:
```css
/* Motion */
--duration-hover: 20ms;      /* ← 추가: Notion 핵심 hover 속도 */
--duration-micro: 100ms;
--duration-short: 150ms;
--duration-medium: 200ms;
```

- [ ] **Step 2: .notion-hover 클래스 추가 (globals.css 하단)**

`globals.css` 파일 맨 끝에 추가:
```css
/* =============================================
   Notion UI Utilities
   ============================================= */

/* 모든 클릭 가능한 사이드바/메뉴 아이템에 사용 */
.notion-hover {
  border-radius: 3px;
  transition: background-color var(--duration-hover) ease,
              color var(--duration-hover) ease;
}
.notion-hover:hover {
  background-color: var(--bg-hover);
}
.notion-hover:active {
  background-color: var(--bg-active);
}

/* 드롭다운/팝오버/컨텍스트 메뉴 컨테이너 */
.notion-menu {
  background: var(--bg-default);
  border-radius: 6px;
  box-shadow: var(--shadow-menu);
  padding: 6px;
  min-width: 180px;
}

/* focus outline 대체 */
.notion-focus-ring:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-blue);
}

/* 구분선 */
.notion-divider-line {
  height: 1px;
  background: var(--divider);
  margin: 4px 0;
}

/* 얇은 hover 스크롤바 */
.notion-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 200ms ease;
}
.notion-scrollbar:hover {
  scrollbar-color: var(--text-tertiary) transparent;
}
```

- [ ] **Step 3: .block-handle-btn transition을 --duration-hover로 교체**

`globals.css` 205-218행 (block-handle-btn 섹션):
```css
/* 변경 전 */
.block-handle-btn {
  ...
  transition: background-color 100ms ease, color 100ms ease;
}

/* 변경 후 */
.block-handle-btn {
  ...
  transition: background-color var(--duration-hover) ease,
              color var(--duration-hover) ease;
}
```

- [ ] **Step 4: 드롭다운 open/close 애니메이션 추가**

`globals.css` `@keyframes menu-fade-in` (현재 있음) 바로 아래에:
```css
/* Dropdown open */
.animate-dropdown-in {
  animation: menu-fade-in var(--duration-short) ease-out forwards;
}

/* Dropdown close (JS로 class 교체 시 사용) */
@keyframes menu-fade-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-4px); }
}
.animate-dropdown-out {
  animation: menu-fade-out 100ms ease-in forwards;
}

/* Modal slide-up */
@keyframes modal-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-modal-in {
  animation: modal-slide-up var(--duration-medium) ease-out forwards;
}
```

- [ ] **Step 5: slash-command-menu 애니메이션을 translateY 포함으로 업그레이드**

현재 `.slash-command-menu` 는 `slash-fade-in` (opacity만) 사용. `menu-fade-in`으로 교체:
```css
/* 변경 전 */
.slash-command-menu {
  animation: slash-fade-in 100ms ease-out;
}

/* 변경 후 */
.slash-command-menu {
  animation: menu-fade-in var(--duration-short) ease-out;
}
```

- [ ] **Step 6: 커밋**

```bash
git add notion/apps/web/src/app/globals.css
git commit -m "style: --duration-hover 추가, .notion-hover/.notion-menu 유틸 클래스, 드롭다운 애니메이션 정비"
```

---

## Task 4: NotionMenuItem.tsx 생성 [Phase 2]

**파일:**
- Create: `notion/apps/web/src/components/ui/NotionMenuItem.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NotionMenuItemProps {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function NotionMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  className,
  danger = false,
  disabled = false,
}: NotionMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "notion-hover flex w-full items-center gap-2 px-2 h-7 text-left text-sm",
        danger
          ? "text-[#eb5757] hover:bg-[rgba(235,87,87,0.08)]"
          : "text-[var(--text-primary)]",
        disabled && "opacity-40 pointer-events-none",
        className
      )}
    >
      {icon && (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-secondary)]">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add notion/apps/web/src/components/ui/NotionMenuItem.tsx
git commit -m "feat: NotionMenuItem 공통 컴포넌트 추가"
```

---

## Task 5: NotionDropdown.tsx 생성 [Phase 2]

**파일:**
- Create: `notion/apps/web/src/components/ui/NotionDropdown.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NotionDropdownProps {
  children: ReactNode;
  className?: string;
}

export function NotionDropdown({ children, className }: NotionDropdownProps) {
  return (
    <div className={cn("notion-menu animate-dropdown-in", className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add notion/apps/web/src/components/ui/NotionDropdown.tsx
git commit -m "feat: NotionDropdown 공통 컴포넌트 추가"
```

---

## Task 6: NotionDivider.tsx 생성 [Phase 2]

**파일:**
- Create: `notion/apps/web/src/components/ui/NotionDivider.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { cn } from "@/lib/utils";

export function NotionDivider({ className }: { className?: string }) {
  return <div className={cn("notion-divider-line", className)} />;
}
```

- [ ] **Step 2: 공통 컴포넌트 index export에 추가**

`notion/apps/web/src/components/ui/` 디렉토리에 `index.ts`가 있으면:
```ts
export { NotionMenuItem } from "./NotionMenuItem";
export { NotionDropdown } from "./NotionDropdown";
export { NotionDivider } from "./NotionDivider";
```
없으면 각 파일에서 직접 import해도 무방.

- [ ] **Step 3: 커밋**

```bash
git add notion/apps/web/src/components/ui/NotionDivider.tsx
git commit -m "feat: NotionDivider 공통 컴포넌트 추가"
```

---

## Task 7: 사이드바 .notion-hover 적용 [Phase 3-B] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/sidebar/sidebar.tsx`
- Modify: `notion/apps/web/src/components/sidebar/page-tree-item.tsx`

- [ ] **Step 1: sidebar.tsx 읽기**

```bash
cat notion/apps/web/src/components/sidebar/sidebar.tsx
```

- [ ] **Step 2: sidebar.tsx — 모든 클릭 가능 아이템에 .notion-hover 적용**

파일에서 `hover:bg-` 접두어로 시작하는 Tailwind 클래스를 모두 찾아 `notion-hover` 클래스로 교체. 예:
```tsx
// 변경 전: Tailwind hover 클래스 사용
<button className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 ...">

// 변경 후: notion-hover 클래스
<button className="notion-hover flex items-center gap-2 px-2 py-1 ...">
```

사이드바 접기 버튼, 페이지 추가 버튼, 즐겨찾기/검색/설정 아이템 모두 동일하게 적용.

사이드바 collapse width 트랜지션이 없으면 컨테이너에 추가:
```tsx
// 사이드바 외부 wrapper div에 transition 추가
<div
  className={cn(
    "transition-[width] duration-200 ease-in-out overflow-hidden",
    isCollapsed ? "w-0" : "w-60"
  )}
>
```

- [ ] **Step 3: page-tree-item.tsx 읽기**

```bash
cat notion/apps/web/src/components/sidebar/page-tree-item.tsx
```

- [ ] **Step 4: page-tree-item.tsx — 트리 아이템에 .notion-hover 적용**

각 페이지 아이템 버튼/div에서 `hover:bg-` 클래스 제거 후 `notion-hover` 추가.

toggle 화살표 rotate 트랜지션 확인. 없으면:
```tsx
<ChevronRight
  className={cn(
    "h-3 w-3 text-[var(--text-tertiary)] transition-transform duration-100 ease-in",
    isExpanded && "rotate-90"
  )}
/>
```

hover 시 나타나는 `+` 버튼 (새 페이지 추가):
```tsx
<button
  className="notion-hover opacity-0 group-hover:opacity-100 transition-opacity duration-[20ms] ..."
>
  <Plus className="h-3.5 w-3.5" />
</button>
```

- [ ] **Step 5: 사이드바 시각 확인**

개발 서버 실행 후 사이드바에서 다음 확인:
- 아이템 hover 시 부드러운 배경 (20ms transition)
- 화살표 rotate 애니메이션 (100ms)
- 사이드바 접기/펼치기 (200ms)

- [ ] **Step 6: 커밋**

```bash
git add notion/apps/web/src/components/sidebar/sidebar.tsx notion/apps/web/src/components/sidebar/page-tree-item.tsx
git commit -m "style: 사이드바 notion-hover 적용, collapse 트랜지션, 화살표 animate"
```

---

## Task 8: 에디터 블록 핸들 + 슬래시 메뉴 개선 [Phase 3-A] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/editor/block-handle.tsx`
- Modify: `notion/apps/web/src/components/editor/block-handle-overlay.tsx`
- Modify: `notion/apps/web/src/components/editor/slash-command-list.tsx`

- [ ] **Step 1: block-handle.tsx + block-handle-overlay.tsx 읽기**

```bash
cat notion/apps/web/src/components/editor/block-handle.tsx
cat notion/apps/web/src/components/editor/block-handle-overlay.tsx
```

- [ ] **Step 2: 블록 핸들 opacity 트랜지션 확인 및 추가**

블록 핸들 컨테이너(오버레이)가 블록 hover 시 나타나는지 확인. 현재 `opacity` 트랜지션이 없으면 핸들 래퍼에:
```tsx
<div
  className={cn(
    "transition-opacity duration-100 ease-in",
    isBlockHovered ? "opacity-100" : "opacity-0"
  )}
>
  {/* 드래그 핸들 버튼들 */}
</div>
```

드래그 핸들 버튼 클래스 패턴 확인. `block-handle-btn` CSS 클래스가 있으면 이미 transition 적용됨 (Task 3에서 수정함). 버튼에 해당 클래스가 없으면 추가:
```tsx
<button className="block-handle-btn block-handle-btn--drag" ...>
```

- [ ] **Step 3: slash-command-list.tsx 읽기**

```bash
cat notion/apps/web/src/components/editor/slash-command-list.tsx
```

- [ ] **Step 4: 슬래시 메뉴 아이템에 .notion-hover 적용**

슬래시 메뉴 컨테이너에 `.notion-menu` 클래스 확인. 없으면 래퍼에:
```tsx
<div className="notion-menu notion-scrollbar max-h-80 overflow-y-auto w-72 z-[70]">
```

각 메뉴 아이템에서 `hover:bg-` 계열 Tailwind 클래스 제거 후 `notion-hover` 적용:
```tsx
<button
  className={cn(
    "notion-hover flex w-full items-center gap-3 px-2 h-9 text-sm",
    selectedIndex === index && "bg-[var(--bg-hover)]"
  )}
>
  <span className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)]">
    {item.icon}
  </span>
  <div className="flex flex-col items-start">
    <span className="text-[var(--text-primary)] text-sm">{item.title}</span>
    {item.description && (
      <span className="text-[var(--text-tertiary)] text-xs">{item.description}</span>
    )}
  </div>
</button>
```

- [ ] **Step 5: 슬래시 메뉴 열림 시각 확인**

개발 서버에서 에디터에 `/` 입력 → 메뉴가 translateY(-4px)→0 + opacity로 부드럽게 열리는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add notion/apps/web/src/components/editor/block-handle.tsx notion/apps/web/src/components/editor/block-handle-overlay.tsx notion/apps/web/src/components/editor/slash-command-list.tsx
git commit -m "style: 블록 핸들 opacity 트랜지션, 슬래시 메뉴 notion-hover/menu 스타일"
```

---

## Task 9: 버블 메뉴 개선 [Phase 3-A] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/editor/bubble-menu.tsx`

- [ ] **Step 1: 파일 읽기**

```bash
cat notion/apps/web/src/components/editor/bubble-menu.tsx
```

- [ ] **Step 2: 버블 메뉴 컨테이너에 그림자 + 애니메이션 적용**

버블 메뉴 래퍼 div에 다음 클래스 적용:
```tsx
<div
  className={cn(
    "notion-menu animate-dropdown-in flex items-center gap-0.5 p-1",
    // 기존 클래스 중 shadow/bg/rounded 관련은 제거하고 notion-menu로 통일
  )}
>
```

- [ ] **Step 3: 버블 메뉴 버튼에 .notion-hover 적용**

각 서식 버튼(Bold, Italic, Link 등)에서 `hover:bg-` 계열 클래스 제거 후:
```tsx
<button
  className={cn(
    "notion-hover flex h-7 w-7 items-center justify-center text-sm",
    isActive ? "bg-[var(--bg-active)] text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
  )}
>
```

- [ ] **Step 4: 시각 확인**

에디터에서 텍스트 선택 → 버블 메뉴가 translateY(-8px)에서 0으로 fade-in되는지 확인. 버튼 hover 시 20ms bg 반응 확인.

- [ ] **Step 5: 커밋**

```bash
git add notion/apps/web/src/components/editor/bubble-menu.tsx
git commit -m "style: 버블 메뉴 notion-menu 스타일, 버튼 notion-hover 적용"
```

---

## Task 10: 에디터 타이포그래피 & placeholder [Phase 3-F] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/editor/block-editor.tsx`

- [ ] **Step 1: 파일 읽기**

```bash
cat notion/apps/web/src/components/editor/block-editor.tsx
```

- [ ] **Step 2: 에디터 내 placeholder 색상 적용**

`block-editor.tsx` 또는 연결된 CSS에서 Tiptap placeholder 스타일을 찾아 `--text-placeholder` 사용:
```tsx
// Tiptap Placeholder extension 설정 부분에서:
Placeholder.configure({
  placeholder: ({ node }) => {
    if (node.type.name === "heading") return "";
    return "Type '/' for commands";
  },
  // 또는 CSS에서:
})
```

`globals.css` 또는 `block-editor.tsx` 내 `<style>` 태그에서:
```css
.notion-editor .tiptap p.is-editor-empty:first-child::before,
.notion-editor .tiptap .is-empty::before {
  color: var(--text-placeholder);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
```

- [ ] **Step 3: 인라인 코드 스타일 업데이트**

`globals.css`에 인라인 코드 스타일 추가 또는 수정:
```css
/* 인라인 코드 */
.notion-editor .tiptap code:not(pre code) {
  background: rgba(135, 131, 120, 0.15);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 0.875em;
  font-family: var(--font-mono);
  color: var(--color-red);
}
```

- [ ] **Step 4: 링크 스타일 업데이트**

```css
/* 링크 */
.notion-editor .tiptap a {
  color: var(--accent-blue);
  text-decoration: none;
  cursor: pointer;
}
.notion-editor .tiptap a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 5: Bold weight 600으로 조정**

```css
/* Bold — Notion은 700이 아닌 600 사용 */
.notion-editor .tiptap strong {
  font-weight: 600;
}
```

- [ ] **Step 6: 코드블록 배경 스타일**

```css
/* 코드블록 */
.notion-editor .tiptap pre {
  background: rgba(135, 131, 120, 0.15);
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
}
.notion-editor .tiptap pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  color: var(--text-primary);
  font-size: 14px;
}
```

- [ ] **Step 7: 시각 확인**

개발 서버에서 에디터 빈 줄에 `Type '/' for commands` placeholder 색상 확인, 인라인 코드 배경 확인, Bold 텍스트 weight 확인.

- [ ] **Step 8: 커밋**

```bash
git add notion/apps/web/src/components/editor/block-editor.tsx notion/apps/web/src/app/globals.css
git commit -m "style: 에디터 placeholder/인라인코드/링크/bold/코드블록 Notion 스타일 적용"
```

---

## Task 11: 상단바 & 브레드크럼 [Phase 3-C] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx`

- [ ] **Step 1: 파일 읽기**

```bash
cat "notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx"
```

- [ ] **Step 2: 브레드크럼 세그먼트 .notion-hover 적용**

브레드크럼 각 세그먼트 버튼/span에 `notion-hover` 적용:
```tsx
<button className="notion-hover flex items-center gap-1 px-1 py-0.5 text-sm text-[var(--text-secondary)]">
  {segment.icon && <span className="text-[14px]">{segment.icon}</span>}
  <span>{segment.title}</span>
</button>
```

브레드크럼 구분자:
```tsx
<span className="text-[var(--text-tertiary)] text-sm mx-0.5">/</span>
```

- [ ] **Step 3: 우측 액션 버튼 (Share, 즐겨찾기, 댓글 등) .notion-hover 적용**

```tsx
<button className="notion-hover flex items-center gap-1 px-2 h-7 text-sm text-[var(--text-secondary)]">
  <Share className="h-4 w-4" />
  <span>Share</span>
</button>
```

- [ ] **Step 4: 페이지 제목 placeholder 색상 적용**

페이지 제목 input/contenteditable에:
```tsx
// contenteditable 방식이면 globals.css에:
// .page-title:empty::before { color: var(--text-placeholder); content: "Untitled"; }

// input 방식이면:
<input
  className="placeholder:text-[var(--text-placeholder)] focus:outline-none text-4xl font-bold w-full bg-transparent"
  placeholder="Untitled"
/>
```

- [ ] **Step 5: 커밋**

```bash
git add "notion/apps/web/src/app/(app)/workspace/[workspaceId]/[pageId]/page.tsx"
git commit -m "style: 상단바 브레드크럼 notion-hover, 우측 액션 버튼, 페이지 제목 placeholder"
```

---

## Task 12: 데이터베이스 뷰 스타일 [Phase 3-E] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/database/table-view.tsx`
- Modify: `notion/apps/web/src/components/database/board-view.tsx`
- Modify: `notion/apps/web/src/components/database/filter-toolbar.tsx`

- [ ] **Step 1: table-view.tsx 읽기**

```bash
cat notion/apps/web/src/components/database/table-view.tsx
```

- [ ] **Step 2: 테이블 셀 hover 스타일**

테이블 셀에서 `hover:bg-` 클래스 제거 후 `notion-hover` 적용. 단, 셀은 `border-radius: 0` 으로 오버라이드:
```tsx
<td
  className="notion-hover rounded-none border-b border-[var(--divider)] px-2 py-1.5 text-sm text-[var(--text-primary)] cursor-pointer"
>
```

- [ ] **Step 3: 뷰 탭 active 상태 개선**

뷰 탭 선택 버튼에서 `underline` 또는 `border-b` 기반 active 표시를 배경 기반으로 교체:
```tsx
<button
  className={cn(
    "notion-hover px-2 h-7 text-sm rounded-[3px]",
    isActive
      ? "bg-[var(--bg-active)] text-[var(--text-primary)] font-medium"
      : "text-[var(--text-secondary)]"
  )}
>
  {view.label}
</button>
```

- [ ] **Step 4: board-view.tsx 카드 스타일**

```bash
cat notion/apps/web/src/components/database/board-view.tsx
```

보드 카드에 `shadow-card` 적용, hover 시 shadow 강화:
```tsx
<div
  className={cn(
    "rounded-[6px] p-3 text-sm transition-shadow duration-[var(--duration-hover)]",
    "shadow-[var(--shadow-card)] bg-[var(--bg-default)]",
    "hover:shadow-[var(--shadow-menu)]"
  )}
>
```

- [ ] **Step 5: filter-toolbar.tsx 필터 칩 스타일**

```bash
cat notion/apps/web/src/components/database/filter-toolbar.tsx
```

필터 칩 (badge)에서 `border` 기반 스타일 → `bg` + `rounded-[3px]`:
```tsx
<button className="notion-hover flex items-center gap-1 px-2 h-6 rounded-[3px] text-xs text-[var(--text-secondary)] bg-[var(--bg-hover)]">
  <span>{filter.property}</span>
  <span className="text-[var(--text-tertiary)]">{filter.condition}</span>
</button>
```

- [ ] **Step 6: 시각 확인**

개발 서버에서 데이터베이스 Table/Board 뷰 열기 → 셀 hover, 보드 카드 hover shadow, 필터 칩 스타일 확인.

- [ ] **Step 7: 커밋**

```bash
git add notion/apps/web/src/components/database/table-view.tsx notion/apps/web/src/components/database/board-view.tsx notion/apps/web/src/components/database/filter-toolbar.tsx
git commit -m "style: 데이터베이스 뷰 셀hover/보드카드/뷰탭/필터칩 Notion 스타일"
```

---

## Task 13: 모달 & 팝오버 개선 [Phase 3-G] ⚡ 병렬 실행 가능

**파일:**
- Modify: `notion/apps/web/src/components/search-modal.tsx`
- Modify: `notion/apps/web/src/components/ui/popover.tsx`

- [ ] **Step 1: search-modal.tsx 읽기**

```bash
cat notion/apps/web/src/components/search-modal.tsx
```

- [ ] **Step 2: 검색 모달 컨테이너에 animate-modal-in 적용**

모달 다이얼로그 컨테이너에:
```tsx
<div
  className={cn(
    "animate-modal-in notion-scrollbar",
    "fixed top-[20%] left-1/2 -translate-x-1/2 z-[var(--z-modal)]",
    "w-[560px] max-h-[480px] overflow-hidden",
    "bg-[var(--bg-default)] rounded-[8px]",
    "shadow-[var(--shadow-modal)]"
  )}
>
```

backdrop:
```tsx
<div
  className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/40 animate-[fade-in_200ms_ease]"
  onClick={onClose}
/>
```

검색 입력창 자동 focus (`autoFocus` prop 추가 또는 `useEffect`로 `.focus()` 호출).

검색 결과 아이템에 `.notion-hover` 적용.

- [ ] **Step 3: popover.tsx 읽기**

```bash
cat notion/apps/web/src/components/ui/popover.tsx
```

- [ ] **Step 4: Popover 컨텐츠에 .notion-menu + .animate-dropdown-in 적용**

Radix UI Popover 사용 중이면 `PopoverContent` className:
```tsx
<PopoverContent
  className={cn(
    "notion-menu animate-dropdown-in p-1",
    "z-[var(--z-dropdown)]",
    className
  )}
  {...props}
>
```

- [ ] **Step 5: 시각 확인**

개발 서버에서 Cmd+K 검색 모달 열기 → slide-up 애니메이션, 자동 focus 확인. 팝오버 열기 → fade-in 확인.

- [ ] **Step 6: 커밋**

```bash
git add notion/apps/web/src/components/search-modal.tsx notion/apps/web/src/components/ui/popover.tsx
git commit -m "style: 검색 모달 animate-modal-in, 팝오버 notion-menu 스타일"
```

---

## Task 14: QA 체크리스트 실행 [Phase 4]

**선행 조건:** Task 2~13 모두 완료

- [ ] **Step 1: 개발 서버 실행**

```bash
cd notion/apps/web && npm run dev
```

http://localhost:3000 접속

- [ ] **Step 2: 사이드바 인터랙션 QA**

| 항목 | 기대값 | 통과/실패 |
|------|--------|-----------|
| 사이드바 아이템 hover bg | 20ms 이내 반응 | |
| 사이드바 접기 | 200ms width 트랜지션 | |
| 페이지 트리 화살표 | rotate 100ms | |
| 새 페이지 "+" 버튼 | hover 시만 출현 | |

- [ ] **Step 3: 에디터 인터랙션 QA**

| 항목 | 기대값 | 통과/실패 |
|------|--------|-----------|
| 블록 핸들 opacity | 블록 hover 시 나타남 100ms | |
| 슬래시 메뉴 open | translateY + opacity 150ms | |
| 버블 메뉴 서식 버튼 hover | 20ms | |
| 인라인 코드 배경 | rgba(135,131,120,0.15) | |
| 빈 블록 placeholder | "Type '/' for commands" + 연한 색상 | |
| Bold 텍스트 weight | 600 (두껍지만 700보다 부드러움) | |

- [ ] **Step 4: 데이터베이스 QA**

| 항목 | 기대값 | 통과/실패 |
|------|--------|-----------|
| 테이블 셀 hover | notion-hover bg | |
| 보드 카드 hover | shadow 강화 | |
| 필터 칩 스타일 | badge가 아닌 flat style | |
| 뷰 탭 active | underline 없이 bg 기반 | |

- [ ] **Step 5: 모달 QA**

| 항목 | 기대값 | 통과/실패 |
|------|--------|-----------|
| 검색 모달 open | slide-up 200ms | |
| 검색 입력창 | 자동 focus | |
| 팝오버 open | fade-in + translateY 150ms | |

- [ ] **Step 6: 다크모드 QA**

테마 토글 → 각 영역 확인. 깨지는 색상(하드코딩 white/black 등) 발견 시 `var(--text-primary)` 등 CSS 변수로 교체.

- [ ] **Step 7: 전체 커밋 + PR**

```bash
git log --oneline feat/database-features ^main | head -20
```

모든 Task 커밋이 정상 반영됐는지 확인 후 PR 생성.

---

## 병렬 실행 가이드

Task 7~13은 서로 독립적인 파일을 수정하므로 병렬로 실행 가능:

```
Task 2 → Task 3 → Task 4 (순차, globals.css 충돌 방지)
Task 5, 6, 7 (신규 파일, 순서 무관)
Task 8 ~ Task 13 (병렬 실행 가능, 각기 다른 파일)
Task 14 (모든 Task 완료 후)
```

**subagent-driven-development 사용 시 에이전트 배분 예시:**
- agent-1: Task 7 (사이드바)
- agent-2: Task 8 + 9 (에디터 핸들/슬래시/버블)
- agent-3: Task 10 (타이포)
- agent-4: Task 11 (상단바)
- agent-5: Task 12 (DB 뷰)
- agent-6: Task 13 (모달)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` | Scope & strategy | 1 | clean | 2 premise conflicts resolved, DESIGN.md sync added |
| Design Review | `/autoplan` | UI/UX gaps | 1 | issues_open | 3.6/10 — missing states, a11y critical; TODOS 이관 |
| Eng Review | `/autoplan` | Architecture & tests | 1 | issues_open | 3 critical bugs auto-fixed (Tailwind v4 layer, duration-hover, Radix conflict) |
| DX Review | skipped | No developer-facing scope | 0 | — | — |
| CEO Voices | `/autoplan` | Dual voice consensus | 1 | clean | 6/6 confirmed — DESIGN.md + Tailwind v4 independently found |
| Design Voices | `/autoplan` | Dual voice consensus | 1 | clean | 7/7 confirmed — state coverage + a11y independently found |
| Eng Voices | `/autoplan` | Dual voice consensus | 1 | clean | 6/6 confirmed — layer system + blast radius independently found |

**VERDICT:** APPROVED (19 decisions, 18 auto-decided, 1 premise gate). 3 critical bugs auto-fixed. Ready for implementation via `superpowers:subagent-driven-development`.
