# Notion UI 완전 재현 설계 스펙

**날짜:** 2026-04-17  
**브랜치:** feat/database-features  
**목표:** 7개 UI 영역 전체를 Notion 실제 디자인 기준으로 역분석 후 일괄 교체, "부드럽고 예쁜 Notion 느낌" 달성

---

## 1. 배경 & 목표

현재 클론은 Tiptap v3 + Yjs + Tailwind CSS v4 기반으로 기능은 대부분 구현되어 있으나, **전반적인 UI 인터랙션이 딱딱하고 Notion과 다른 느낌**이 강하다. 7개 영역 모두 개선이 필요하다.

### 성공 기준

- 모든 hover 상태가 20ms ease 트랜지션으로 응답
- 드롭다운/모달이 부드러운 fade + slide 애니메이션으로 열림
- 색상 토큰이 Notion 실측값(rgb(55,53,47) 계열)으로 통일
- 다크모드 포함 7개 영역 시각 QA 통과

---

## 2. 접근 방식: Notion 역분석 우선

```
Phase 1: Notion DevTools 분석 → docs/notion-ui-audit.md
Phase 2: Design System 업데이트 (globals.css + 공통 컴포넌트)
Phase 3: 7개 영역 병렬 적용
Phase 4: 시각/인터랙션/다크모드 QA
```

---

## 3. Design System 개선 (Phase 2)

### 3.1 색상 토큰 수정 — `globals.css`

```css
/* 텍스트 */
--text-primary:      rgb(55, 53, 47);
--text-secondary:    rgba(55, 53, 47, 0.65);
--text-tertiary:     rgba(55, 53, 47, 0.45);
--text-placeholder:  rgba(55, 53, 47, 0.35);

/* 배경 */
--bg-default:  #ffffff;
--bg-sidebar:  rgb(247, 247, 245);
--bg-hover:    rgba(55, 53, 47, 0.08);
--bg-active:   rgba(55, 53, 47, 0.16);

/* 다크모드 */
--dark-bg-default:  #191919;
--dark-text-primary: rgba(255, 255, 255, 0.81);
--dark-bg-hover:    rgba(255, 255, 255, 0.055);

/* 선택 */
--selection-bg: rgba(35, 131, 226, 0.28);
```

### 3.2 트랜지션 토큰 수정

```css
--duration-hover:  20ms;   /* hover bg/color — 핵심 */
--duration-micro:  100ms;  /* 토글, 화살표 rotate */
--duration-short:  150ms;  /* 드롭다운 open/close */
--duration-medium: 200ms;  /* 사이드바, 모달 */
```

### 3.3 그림자 토큰 (Notion 실측 기준으로 Phase 1 후 확정)

```css
--shadow-menu:
  rgba(15, 15, 15, 0.1) 0px 0px 0px 1px,
  rgba(15, 15, 15, 0.1) 0px 3px 6px,
  rgba(15, 15, 15, 0.2) 0px 9px 24px;

--shadow-card:
  rgba(15, 15, 15, 0.1) 0px 0px 0px 1px;

--shadow-modal:
  rgba(15, 15, 15, 0.1) 0px 0px 0px 1px,
  rgba(15, 15, 15, 0.2) 0px 5px 10px,
  rgba(15, 15, 15, 0.4) 0px 15px 40px;
```

### 3.4 Border Radius

```css
--radius-sm: 3px;   /* 사이드바 아이템, 인라인 코드, 컨텍스트 메뉴 아이템 */
--radius-md: 4px;   /* 버튼 */
--radius-lg: 6px;   /* 카드, 코드블록 컨테이너 */
--radius-xl: 8px;   /* 모달, 팝오버, 검색창 */
```

### 3.5 글로벌 유틸리티 클래스 (`globals.css` 또는 `utils.ts`)

| 클래스 | 용도 |
|--------|------|
| `.notion-hover` | hover bg rgba(55,53,47,0.08), radius 3px, transition 20ms |
| `.notion-focus-ring` | outline 제거, box-shadow 기반 focus |
| `.notion-text-primary/secondary/tertiary/placeholder` | 색상 계층 |
| `.notion-menu` | 드롭다운/팝오버 컨테이너 스타일 |
| `.notion-divider` | 1px rgba(55,53,47,0.09) separator |
| `.notion-scrollbar` | hover 시 나타나는 얇은 webkit 스크롤바 |

### 3.6 신규 공통 컴포넌트 (`components/ui/`)

- `NotionMenuItem.tsx` — 28px 높이, .notion-hover, icon(14px) + label
- `NotionDropdown.tsx` — .notion-menu 래퍼, 150ms fade+translateY 애니메이션
- `NotionDivider.tsx` — .notion-divider 래퍼

---

## 4. 7개 영역별 작업 명세 (Phase 3)

### A. 에디터 경험

**파일:** `block-editor.tsx`, `bubble-menu.tsx`, `block-handle*.tsx`, `slash-command*.tsx`, `extensions/callout-extension.ts`, `extensions/toggle-extension.ts`

| 항목 | 적용 내용 |
|------|-----------|
| 블록 hover 핸들 | `opacity: 0 → 1`, `transition: opacity 100ms ease` |
| 슬래시 메뉴 | `opacity 0→1 + translateY(-4px)→0`, `duration-short` |
| 버블 메뉴 | `translateY(-8px)→0 + opacity`, 버튼 `.notion-hover` |
| 드래그앤드롭 | ghost `opacity: 0.5 + box-shadow`, drop line `2px solid accent`, `cursor: grabbing` |
| 빈 블록 placeholder | `color: var(--text-placeholder)`, `"Type '/' for commands"` |
| 코드블록 | `background: rgba(135,131,120,0.15)`, 언어 드롭다운 NotionDropdown |
| 토글 화살표 | `rotate 100ms ease` |
| 인라인 코드 | `bg rgba(135,131,120,0.15)`, `radius 3px`, `padding: 0.2em 0.4em` |

### B. 사이드바 & 내비게이션

**파일:** `sidebar/sidebar.tsx`, `sidebar/page-tree-item.tsx`, `sidebar/list-skeleton.tsx`

| 항목 | 적용 내용 |
|------|-----------|
| 아이템 hover | `.notion-hover` 전역 적용 |
| 사이드바 접기 | `width 200ms ease` + opacity 페이드 |
| 페이지 트리 인덴트 | 레벨당 12px, 화살표 `rotate 100ms ease` |
| 드래그 리오더 | 2px line 인디케이터, ghost 투명도 |
| 새 페이지 "+" | hover 시만 노출, `opacity 0→1 20ms` |

### C. 상단 바 & 브레드크럼

**파일:** `app/[workspace]/[page]/page.tsx` 또는 레이아웃 관련 컴포넌트

| 항목 | 적용 내용 |
|------|-----------|
| 브레드크럼 세그먼트 | `.notion-hover`, 구분자 `color: var(--text-tertiary)` |
| 페이지 제목 | `font-size: 40px`, `font-weight: 700`, `outline: none`, placeholder color |
| 우측 액션 버튼 | icon button `.notion-hover`, `duration-hover` |

### D. 마이크로 인터랙션

**파일:** `globals.css` 애니메이션 키프레임, toast/skeleton 컴포넌트

| 항목 | 적용 내용 |
|------|-----------|
| 드롭다운 open | `opacity 0→1 + translateY(-4px)→0`, `150ms ease-out` |
| 드롭다운 close | `opacity 1→0 + translateY(0→-4px)`, `100ms ease-in` |
| 토스트 | slide-in from bottom, `200ms`, 3초 후 auto dismiss |
| 버튼 active | `transform: scale(0.97)`, `50ms` |
| 스켈레톤 | shimmer gradient sweep 애니메이션 |

### E. 데이터베이스 뷰

**파일:** `database/table-view.tsx`, `database/board-view.tsx`, `database/filter-toolbar.tsx`, `database/property-*.tsx`

| 항목 | 적용 내용 |
|------|-----------|
| 테이블 셀 hover | `.notion-hover`, edit 모드 border |
| 보드 카드 | `shadow-card`, `radius-lg`, hover 시 shadow 강화 |
| 뷰 탭 | bg 기반 active 표시 (underline 제거) |
| 필터 칩 | badge → Notion 스타일 재설계 |
| 속성 아이콘 | lucide `size={14}`, `color: var(--text-secondary)` |

### F. 타이포그래피 & 색상

**파일:** `globals.css`, `block-editor.tsx` inline styles

| 항목 | 적용 내용 |
|------|-----------|
| 링크 | `color: #2383e2`, `text-decoration: none`, hover underline |
| Bold | `font-weight: 600` (700 → 600) |
| 선택 텍스트 | `background: rgba(35,131,226,0.28)` |
| 다크모드 | `--bg-default: #191919`, `--text-primary: rgba(255,255,255,0.81)` |

### G. 모달 & 팝오버

**파일:** `search-modal.tsx`, `share-panel.tsx`, `history-panel.tsx`, `components/ui/popover.tsx`

| 항목 | 적용 내용 |
|------|-----------|
| 모달 backdrop | `rgba(0,0,0,0.4)`, `opacity 0→1 200ms` |
| 모달 자체 | `shadow-modal`, `radius-xl`, `translateY(8px)→0 200ms ease-out` |
| 검색 모달 | 자동 focus, 결과 아이템 `.notion-hover` |
| 컨텍스트 메뉴 | `shadow-menu`, 아이템 높이 28px, `radius-sm` |
| Peek 패널 | 우측 `translateX(100%)→0 200ms`, backdrop 없음 |

---

## 5. Phase 1 분석 산출물 명세

`docs/notion-ui-audit.md`에 다음 항목을 실측값으로 채운다:

- [ ] 트랜지션 duration 및 easing (영역별)
- [ ] 정확한 색상값 (hex/rgba)
- [ ] 그림자 box-shadow 계수
- [ ] 간격 (padding/margin) 기준값
- [ ] hover/focus/active/drag 상태별 스타일
- [ ] 애니메이션 keyframe 상세

---

## 6. 구현 파일 목록 (~30개)

### Phase 2 (Design System)
- `notion/apps/web/src/app/globals.css`
- `notion/apps/web/src/lib/utils.ts`
- `notion/apps/web/src/components/ui/NotionMenuItem.tsx` (신규)
- `notion/apps/web/src/components/ui/NotionDropdown.tsx` (신규)
- `notion/apps/web/src/components/ui/NotionDivider.tsx` (신규)

### Phase 3 (7개 영역)
- `notion/apps/web/src/components/editor/block-editor.tsx`
- `notion/apps/web/src/components/editor/collaborative-editor.tsx`
- `notion/apps/web/src/components/editor/bubble-menu.tsx`
- `notion/apps/web/src/components/editor/block-handle*.tsx` (2개)
- `notion/apps/web/src/components/editor/slash-command*.tsx` (2개)
- `notion/apps/web/src/components/editor/extensions/callout-extension.ts`
- `notion/apps/web/src/components/editor/extensions/toggle-extension.ts`
- `notion/apps/web/src/components/sidebar/sidebar.tsx`
- `notion/apps/web/src/components/sidebar/page-tree-item.tsx`
- `notion/apps/web/src/components/sidebar/list-skeleton.tsx`
- `notion/apps/web/src/components/database/table-view.tsx`
- `notion/apps/web/src/components/database/board-view.tsx`
- `notion/apps/web/src/components/database/filter-toolbar.tsx`
- `notion/apps/web/src/components/database/property-cell.tsx`
- `notion/apps/web/src/components/database/property-header.tsx`
- `notion/apps/web/src/components/search-modal.tsx`
- `notion/apps/web/src/components/share-panel.tsx`
- `notion/apps/web/src/components/history-panel.tsx`
- `notion/apps/web/src/components/ui/popover.tsx`
- 페이지 레이아웃/상단바 관련 1~2개 (Phase 1 분석 후 확정)

---

## 7. QA 체크리스트 (Phase 4)

- [ ] 모든 hover가 20ms 이내로 반응
- [ ] 드롭다운 열림/닫힘 애니메이션 자연스러움
- [ ] 사이드바 접기/펼치기 200ms 부드러움
- [ ] 드래그앤드롭 ghost + drop indicator 표시
- [ ] 에디터 placeholder 색상 적절
- [ ] 코드블록 배경색 및 폰트 Notion 기준
- [ ] 모달 backdrop + slide-up 애니메이션
- [ ] 라이트/다크 모드 전환 시 색상 깨짐 없음
- [ ] 데이터베이스 셀 hover/edit 상태 구분
- [ ] 전반적 색상이 따뜻한 rgb(55,53,47) 계열
