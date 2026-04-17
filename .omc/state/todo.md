# TODO — Notion Canvas iframe-mounted subroute (2026-04-17)

Source spec: `docs/superpowers/specs/2026-04-17-notion-canvas-iframe-design.md`

- [x] F1: Persistent iframe registry — `notion-iframe-registry.ts` (acquire/release/bindPlaceholder/destroy, position:fixed sync, refCount, scroll/resize listeners, view-transition-name wiring) (2026-04-17 완료)
- [ ] F2: NotionCanvasFrame React wrapper — placeholder div, ResizeObserver-tracked, panel/full mode, load/error handling with 5 s timeout, markdown-fallback callback
- [x] F3: `/notion-embed/*` subroute — minimal layout (no slack ThemeProvider/Web3Provider), globals-notion.css, pages/[id]/page.tsx renders the editor body only (2026-04-17 완료)
- [ ] F4: CanvasEditor panel branch — `canvas.pageId` → `<NotionCanvasFrame pageId mode="panel" onExpand>` with `handleExpand` calling `seamlessNavigate(() => router.push('/pages/${id}'))`
- [ ] F5: Full-page `/pages/[id]/page.tsx` swaps body to `<NotionCanvasFrame pageId mode="full" onCollapse>` so iframe identity is preserved across the morph
- [ ] F6: Security headers — `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` on `/notion-embed/*` via Next.js headers config
- [ ] F7: Iframe load-failure path — 5 s timeout surfaces fallback UI with a "Switch to markdown" button that flips the canvas back to the legacy markdown branch
- [ ] F8: Build green — `npm run build` (slack workspace) passes with zero TS / lint errors after all changes

---

## Archive — Canvas/Notion Integration 복구 (2026-04-17 완료)

- [x] feat-A: ISSUE-001 — Canvas 패널 channelId 가드 + 토스트/콘솔 에러 로깅
- [x] feat-B: ISSUE-002 — canvas routes 명시적 column projection + try/catch 구조화 JSON
- [x] feat-C: ISSUE-003 — `messages/members/canvas/canvases/mcp` 전체에 `resolveChannelParam` + 구조화 404/500 JSON
- [x] final-dogfood: localhost:3004 재검증 — Canvas 생성 + Notion 블록 에디터 + slash 메뉴 15종 블록 모두 동작
- [x] Task 1~14 — notion UI 토큰/컴포넌트 리뉴얼
