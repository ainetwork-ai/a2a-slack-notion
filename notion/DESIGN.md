# Design System — Notion Clone

## Product Context
- **What this is:** 노션과 동일한 기능 패리티를 가진 팀/사내 문서 협업 도구
- **Who it's for:** 1-20명 소규모 팀 (셀프호스팅)
- **Space/industry:** Productivity, document collaboration
- **Project type:** Web app (editor-first workspace)
- **Design principle:** "도구가 사라진다" — 콘텐츠가 주인공. 장식 제로.

## Aesthetic Direction
- **Direction:** Industrial Minimal
- **Decoration level:** Minimal — 타이포그래피와 여백만으로 계층 구조 표현
- **Mood:** 조용하고 집중된. 도구가 아닌 콘텐츠를 느끼게. 종이 위에 쓰는 감각.
- **Reference:** Notion (notion.so) — 1:1 패리티 목표

## Typography
- **UI Chrome / Content Default:**
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"`
- **Content Serif option:** `Lyon-Text, Georgia, ui-serif, serif`
- **Content Mono option:** `iawriter-mono, Nitti, Menlo, Courier, monospace`
- **Code blocks:** `SFMono-Regular, Menlo, Consolas, "Liberation Mono", Courier, monospace`
- **Loading:** 시스템 폰트 사용 — 별도 로딩 없음 (0ms FOUT)

### Type Scale
| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Page Title | 40px | 700 (bold) | 1.2 |
| H1 | 30px | 600 (semibold) | 1.3 |
| H2 | 24px | 600 | 1.3 |
| H3 | 20px | 600 | 1.3 |
| Body | 16px | 400 (regular) | 1.5 |
| Small / UI | 14px | 400 | 1.4 |
| Caption | 12px | 400 | 1.4 |

## Color

### Approach: Restrained
거의 흑백 + 파란 accent 하나. 색상은 블록 컬러에서만 표현적으로 사용.

### Light Mode
```css
--bg-default:       #ffffff;
--bg-sidebar:       #f7f6f3;
--bg-hover:         rgba(55, 53, 47, 0.08);
--bg-active:        rgba(55, 53, 47, 0.16);
--text-primary:     #37352f;
--text-secondary:   rgba(55, 53, 47, 0.65);
--text-tertiary:    rgba(55, 53, 47, 0.45);
--text-placeholder: rgba(55, 53, 47, 0.35);
--accent-blue:      #2383e2;
--divider:          rgba(55, 53, 47, 0.09);
--selection:        rgba(35, 131, 226, 0.28);
```

### Dark Mode
```css
--bg-default:       #191919;
--bg-sidebar:       #202020;
--bg-hover:         rgba(255, 255, 255, 0.04);
--bg-active:        rgba(255, 255, 255, 0.08);
--text-primary:     rgba(255, 255, 255, 0.81);
--text-secondary:   rgba(255, 255, 255, 0.54);
--text-tertiary:    rgba(255, 255, 255, 0.35);
--text-placeholder: rgba(255, 255, 255, 0.25);
--accent-blue:      #529cca;
--divider:          rgba(255, 255, 255, 0.09);
--selection:        rgba(82, 156, 202, 0.2);
```

### Block Colors (9 colors x 2: text + background)
| Name | Text Color | Background Color (Light) | Background Color (Dark) |
|------|-----------|-------------------------|------------------------|
| Red | #eb5757 | #fdebed | rgba(235,87,87,0.15) |
| Orange | #d9730d | #fbecdd | rgba(217,115,13,0.15) |
| Yellow | #cb912f | #fbf3db | rgba(203,145,47,0.15) |
| Green | #448361 | #edf3ec | rgba(68,131,97,0.15) |
| Blue | #337ea9 | #e7f3f8 | rgba(51,126,169,0.15) |
| Purple | #9065b0 | #f4f0f7 | rgba(144,101,176,0.15) |
| Pink | #c14c8a | #f5e0e9 | rgba(193,76,138,0.15) |
| Brown | #9f6b53 | #eee0da | rgba(159,107,83,0.15) |
| Gray | #787774 | #f1f1ef | rgba(120,119,116,0.15) |

## Borders & Dividers

**핵심 원칙: 하드 보더 금지.** `border: 1px solid` 대신 항상 rgba 또는 box-shadow 사용.
노션은 경계선이 "보일 듯 말 듯" 부드럽게 존재한다. 이 감각을 유지할 것.

### Border 규칙
- **Divider (수평선):** `border-bottom: 1px solid var(--divider)` — rgba(55,53,47,0.09)로 거의 안 보임
- **사이드바 경계:** `border-right: 1px solid var(--divider)` — 동일하게 거의 투명
- **카드/컨테이너:** `border` 사용 금지. `box-shadow`로 경계 표현:
  ```css
  box-shadow: 0 0 0 1px rgba(15, 15, 15, 0.05);
  ```
- **호버 시 경계 강조:** 기본 투명 → hover 시 `var(--divider)` 표시
- **테이블 셀:** `border-bottom: 1px solid var(--divider)` — 행 구분만, 열 구분 없음
- **입력 필드:** 기본 보더 없음. focus 시 `box-shadow: 0 0 0 2px var(--accent-blue)` (inset)
- **선택/활성 상태:** border 대신 `background` 색상 변경 (`--bg-active`)

### 절대 하지 말 것
- `border: 1px solid #ccc` 또는 하드코딩된 색상 보더
- `border: 1px solid black` 계열
- 0.2 이상의 opacity를 가진 보더 색상
- 외곽선(outline)을 디자인 요소로 사용 (focus ring 제외)

## Shadows

노션은 그림자도 매우 부드럽다. 3단 레이어링으로 깊이감을 표현.

```css
/* 드롭다운, 메뉴, 자동완성 */
--shadow-menu: 
  0 0 0 1px rgba(15, 15, 15, 0.1),
  0 3px 6px rgba(15, 15, 15, 0.1),
  0 9px 24px rgba(15, 15, 15, 0.2);

/* 카드, 인라인 미리보기 */
--shadow-card: 
  0 0 0 1px rgba(15, 15, 15, 0.05),
  0 2px 4px rgba(15, 15, 15, 0.1);

/* 모달, 다이얼로그 */
--shadow-modal: 
  0 0 0 1px rgba(15, 15, 15, 0.05),
  0 5px 10px rgba(15, 15, 15, 0.1),
  0 15px 40px rgba(15, 15, 15, 0.2);
```

Dark mode에서는 opacity를 높이고 base를 검정으로:
```css
--shadow-menu:  0 0 0 1px rgba(255,255,255,0.05), 0 3px 6px rgba(0,0,0,0.3), 0 9px 24px rgba(0,0,0,0.5);
--shadow-card:  0 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.3);
--shadow-modal: 0 0 0 1px rgba(255,255,255,0.05), 0 5px 10px rgba(0,0,0,0.3), 0 15px 40px rgba(0,0,0,0.5);
```

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

### Key Measurements
| Element | Value |
|---------|-------|
| Sidebar width | 240px (접기 가능, 0px ~ 480px) |
| Content max-width | 900px (full-width 토글 가능) |
| Page padding (desktop) | 96px 좌우 |
| Page padding (tablet) | 48px 좌우 |
| Page padding (mobile) | 24px 좌우 |
| Block vertical gap | Paragraph: 2px, Heading: 32px above |
| Sidebar item height | 28px |
| Topbar height | 44px |
| Inline element padding | 2px 4px |

## Layout
- **Approach:** Grid-disciplined (3-panel)
- **Shell:** Sidebar (left, collapsible) | Main content (center, scrollable) | Peek panel (right, conditional)
- **Sidebar sections:** Search, Favorites, Private, Shared, Trash
- **Top bar:** Breadcrumb trail (left) | Share + Favorite + More (right)
- **Content:** 단일 컬럼, 중앙 정렬, max-width 900px
- **Responsive breakpoints:**
  - Desktop (>1024px): 사이드바 + 콘텐츠 + peek
  - Tablet (768-1024px): 사이드바 오버레이 드로어
  - Mobile (<768px): 사이드바 숨김, 풀 width 콘텐츠

## Border Radius
| Element | Radius |
|---------|--------|
| Buttons, badges, tags | 3px |
| Cards, menus, dropdowns, callouts | 6px |
| Modals, dialogs | 12px |
| Avatars, profile images | 9999px (원형) |
| Page cover | 0 (edge-to-edge) |
| Input fields | 4px |
| Toggle switches | 9999px |

## Motion
- **Approach:** Minimal functional — 이해를 돕는 전환만
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Durations:**
  - Micro (hover, focus): 100ms
  - Short (dropdown, tooltip): 150ms
  - Medium (sidebar collapse, panel): 200ms
  - Long (modal, page transition): 없음 (instant)
- **원칙:**
  - 페이지 전환에 애니메이션 없음 (instant)
  - 드롭다운/메뉴는 fade-in (opacity 0→1, 150ms)
  - 사이드바 접기/펴기는 width 변화 (200ms)
  - 스크롤바는 오버레이 스타일 (macOS 기본)

## Z-Index Scale
| Layer | Z-Index |
|-------|---------|
| Base content | 0 |
| Sticky topbar | 10 |
| Dropdown, menu, autocomplete | 20 |
| Overlay (sidebar mobile) | 30 |
| Modal backdrop | 40 |
| Modal content | 50 |
| Toast notifications | 60 |
| Slash command menu | 70 |

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-14 | Initial design system created | Notion 1:1 패리티 목표. /design-consultation 기반. |
| 2026-04-14 | 시스템 폰트 사용 결정 | 0ms FOUT, 노션과 동일한 네이티브 감각 |
| 2026-04-14 | 하드 보더 금지 규칙 | rgba + box-shadow로 부드러운 경계. 노션의 "보일 듯 말 듯" 감각 유지 |
| 2026-04-14 | 3단 그림자 레이어링 | 깊이감을 자연스럽게 표현. 노션 프로덕션 값 그대로 |
