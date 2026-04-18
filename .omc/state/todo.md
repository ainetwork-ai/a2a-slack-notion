# TODO — Notion Canvas iframe-mounted subroute (2026-04-17)

Source spec: `docs/superpowers/specs/2026-04-17-notion-canvas-iframe-design.md`

- [x] F1: Persistent iframe registry — `notion-iframe-registry.ts` (acquire/release/bindPlaceholder/destroy, position:fixed sync, refCount, scroll/resize listeners, view-transition-name wiring) (2026-04-17 완료)
- [x] F2: NotionCanvasFrame React wrapper — placeholder div, ResizeObserver-tracked, panel/full mode, load/error handling with 5 s timeout, markdown-fallback callback (2026-04-17 완료)
- [x] F3: `/notion-embed/*` subroute — minimal layout (no slack ThemeProvider/Web3Provider), globals-notion.css, pages/[id]/page.tsx renders the editor body only (2026-04-17 완료)
- [x] F4: CanvasEditor panel branch — `canvas.pageId && !forceMarkdown` → `<NotionCanvasFrame pageId mode="panel" onExpand onSwitchToMarkdown>` with `handleExpand` calling `seamlessNavigate(() => router.push('/pages/${id}'))` + Maximize2 chrome button (2026-04-17 완료)
- [x] F5: Full-page `/pages/[id]/page.tsx` swaps body to `<NotionCanvasFrame pageId mode="full" onCollapse>` so iframe identity is preserved across the morph (2026-04-17 완료)
- [x] F6: Security headers — `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` on `/notion-embed/*` via Next.js headers config (2026-04-17 완료)
- [x] F7: Iframe load-failure path — 5 s timeout surfaces fallback UI with a "Switch to markdown" button that flips the canvas back to the legacy markdown branch (2026-04-17 완료)
- [x] F8: Build green — `npm run build` (slack workspace) passes with zero TS / lint errors after all changes (2026-04-17 완료, exit 0)

## Dogfood 1차 결과 (2026-04-17, partial: 130 tool-use 한계로 중단)
Dogfooder evidence: `dogfood-output-iframe/` (screenshots 01–04 + console log)
- ✅ T1 panel mount, T3 iframe identity, T5 security headers (curl 검증), T6 direct bookmark, T7 markdown fallback: PASS
- ❌ T2 callout/columns/toggle: slash 메뉴에 항목이 존재하지 않음 — `/notion-embed/*`이 슬랙 부분 포팅 `@/components/notion/NotionPage`(10 파일)만 사용. 스펙이 해결하려 했던 INTEGRATION.md bug(c) 미해결. 증거: `dogfood-output-iframe/04-slash-menu-missing-callout-columns-toggle.png`
- ❌ 사이드 이슈: `McpList.tsx` `(integrations ?? []).filter is not a function` 런타임 오류 — 일부 dogfood 플로우를 막음

## 남은 작업
- [x] F9: callout/columns/toggle 확장 7파일 포팅 + extensions.ts/SlashCommand.tsx wire + emoji-picker-react 설치 (2026-04-17 완료, commit 416053d)
- [x] F10: McpList defensive parse `Array.isArray(integrations)` (2026-04-17 완료, commit 8a5fbfd)
- [x] F11: Build re-verify — `npm run build` exit 0, 에러/경고 0 (2026-04-17 완료)
- [x] F12: Dogfood 재검증 — Callout/Toggle/2Columns/3Columns 모두 삽입+렌더, McpList 에러 해소, 184 msgs console에 0 error/0 warning (2026-04-17 완료, evidence `dogfood-output-iframe-r2/report.md`)

---

## 전체 작업 완료 — Notion Canvas iframe-mounted subroute

F1–F8 (아키텍처 + 보안 + 빌드) + F9–F12 (기능 파리티 + 사이드 버그 + 재 dogfood) 모두 PASS. 스펙 요구사항 전부 충족 확인.

---

## Archive — Canvas/Notion Integration 복구 (2026-04-17 완료)

- [x] feat-A: ISSUE-001 — Canvas 패널 channelId 가드 + 토스트/콘솔 에러 로깅
- [x] feat-B: ISSUE-002 — canvas routes 명시적 column projection + try/catch 구조화 JSON
- [x] feat-C: ISSUE-003 — `messages/members/canvas/canvases/mcp` 전체에 `resolveChannelParam` + 구조화 404/500 JSON
- [x] final-dogfood: localhost:3004 재검증 — Canvas 생성 + Notion 블록 에디터 + slash 메뉴 15종 블록 모두 동작
- [x] Task 1~14 — notion UI 토큰/컴포넌트 리뉴얼
