<!-- /autoplan restore point: /home/comcom/.gstack/projects/ainetwork-ai-a2a-slack-notion/feat-database-features-autoplan-restore-20260416-170333.md -->
# Notion MCP + A2A Agent 설계 문서

**날짜**: 2026-04-16  
**상태**: 승인됨

---

## 목표

1. Notion API 엔드포인트를 MCP 서버로 노출 (Claude Desktop/Code에서 사용)
2. MCP 서버를 A2A 에이전트로도 노출 (Notion 에디터 @멘션으로 호출)
3. 데모용 인증 우회 (DEMO_MODE=true)
4. 로그인 페이지에 데모 스킵 버튼 추가

---

## 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                   Notion Web (port 3010)             │
│  ┌──────────────────────────────────────────────┐   │
│  │  Login Page                                  │   │
│  │  [Connect Wallet]  [데모로 시작 →]            │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
          ↕ credentials: include
┌─────────────────────────────────────────────────────┐
│            Notion API (Hono, port 3001)             │
│                                                      │
│  DEMO_MODE=true → 모든 요청에 demo user 자동 주입   │
│  /api/v1/agents  ← A2A agent 등록/호출              │
└─────────────────────────────────────────────────────┘
          ↕ Bearer ${NOTION_API_KEY}
┌─────────────────────────────────────────────────────┐
│        Notion MCP Server (port 3002)                │
│                                                      │
│  ① stdio          → Claude Desktop / Claude Code    │
│  ② POST /mcp      → HTTP MCP (StreamableHTTP)       │
│  ③ GET /.well-known/agent.json  → A2A Agent Card    │
│  ④ POST /a2a      → A2A JSON-RPC endpoint           │
│     └─ Claude SDK (tool-calling loop)               │
│        └─ 내부에서 자신의 MCP 도구들 호출           │
└─────────────────────────────────────────────────────┘
```

### 데이터 흐름 — A2A @멘션

1. 사용자가 에디터에서 `@NotionWriter 마케팅 전략 작성해줘`
2. Notion API → `POST /a2a` (MCP 서버)
3. MCP 서버 내 Claude가 `create_page`, `append_block_children` 등 도구 호출
4. MCP 서버가 Notion API 호출 (Bearer 토큰, DEMO_MODE로 통과)
5. 결과를 SSE 스트리밍으로 에디터에 반환

### 데이터 흐름 — Claude Desktop

1. `MCP_MODE=stdio npx tsx src/index.ts` 실행
2. Claude Desktop이 15개 도구 사용해서 Notion 문서 읽기/쓰기

---

## 변경 상세

### 1. API 서버 — DEMO_MODE

**파일**: `notion/apps/api/src/index.ts`

기존 JWT 쿠키 미들웨어에 DEMO_MODE 분기 추가:

```typescript
app.use(`${API_BASE_PATH}/*`, async (c, next) => {
  // DEMO_MODE: 고정 데모 유저 자동 주입
  if (process.env['DEMO_MODE'] === 'true') {
    const demoUser = await prisma.user.upsert({
      where: { walletAddress: '0x000000000000000000000000000000000000DEMO' },
      update: {},
      create: {
        walletAddress: '0x000000000000000000000000000000000000DEMO',
        name: 'Demo User',
      },
    });
    c.set('user', demoUser);
    await next();
    return;
  }
  // ... 기존 쿠키 검증 로직 유지
});
```

**환경변수**:
```
DEMO_MODE=true
NOTION_API_KEY=demo-secret-key-for-mcp
```

### 2. 로그인 페이지 — 데모 스킵 버튼

**파일**: `notion/apps/web/src/app/(auth)/login/page.tsx`

```tsx
{process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL'] && (
  <button
    onClick={() => router.push(process.env['NEXT_PUBLIC_DEMO_WORKSPACE_URL']!)}
    className="mt-3 w-full py-2 text-xs text-[var(--text-tertiary)] 
               border border-[var(--border-default)] rounded-[var(--radius-sm)]
               hover:text-[var(--text-primary)] hover:border-[var(--border-active)]"
  >
    Try Demo →
  </button>
)}
```

**환경변수**:
```
NEXT_PUBLIC_DEMO_WORKSPACE_URL=/workspace/your-workspace-id
```

### 3. MCP 서버 확장

**파일**: `notion/apps/mcp/src/index.ts`  
**추가 의존성**: `@anthropic-ai/sdk`, `hono`, `@hono/node-server`

#### HTTP 엔드포인트

| 경로 | 용도 |
|---|---|
| `POST /mcp` | StreamableHTTPServerTransport (HTTP MCP) |
| `GET /mcp` | SSE 업그레이드 |
| `GET /.well-known/agent.json` | A2A Agent Card |
| `POST /a2a` | A2A JSON-RPC (Claude tool-calling loop) |
| `GET /health` | 헬스체크 |

#### Transport 모드

```
MCP_MODE=stdio   → Claude Desktop (기본값, 기존 동작)
MCP_MODE=http    → HTTP/SSE + A2A만 실행
MCP_MODE=all     → stdio + HTTP/SSE + A2A 동시 실행
```

#### A2A Agent Card

```json
{
  "name": "Notion Writer",
  "description": "Reads and writes Notion pages and blocks via MCP tools",
  "version": "0.1.0",
  "url": "http://localhost:3002",
  "capabilities": { "streaming": true },
  "skills": [
    { "id": "write_page", "name": "Write Page",
      "description": "Creates or updates a Notion page with content" },
    { "id": "search_docs", "name": "Search Documents",
      "description": "Searches across the workspace" }
  ]
}
```

#### A2A 처리 흐름

```
POST /a2a (A2A JSON-RPC message)
  → Claude SDK (claude-sonnet-4-6)
  → MCP 도구들을 function_definitions로 전달
  → tool_use 루프 (도구 호출 → Notion API → 결과 → 다음 도구)
  → 완료 시 SSE 스트리밍으로 응답 반환
```

#### 추가할 MCP 도구 (5개)

| 도구 | API 엔드포인트 | 설명 |
|---|---|---|
| `list_workspaces` | `GET /workspaces` | 워크스페이스 목록 조회 |
| `list_pages` | `GET /pages?workspace_id=` | 워크스페이스 내 페이지 목록 |
| `get_workspace` | `GET /workspaces/:id` | 특정 워크스페이스 조회 |
| `resolve_comment` | `PATCH /comments/:id/resolve` | 댓글 스레드 해결/미해결 토글 |
| `delete_comment` | `DELETE /comments/:id` | 댓글 삭제 |

#### 기존 MCP 도구 (유지, 15개)

`ping`, `search`, `get_page`, `create_page`, `update_page`, `delete_page`,
`get_block_children`, `append_block_children`, `update_block`, `delete_block`,
`query_database`, `create_database_item`, `update_database_item`,
`get_comments`, `add_comment`

---

## 환경변수 전체 요약

### notion/apps/api
```
DEMO_MODE=true
NOTION_API_KEY=demo-secret-key-for-mcp
```

### notion/apps/web
```
NEXT_PUBLIC_DEMO_WORKSPACE_URL=/workspace/<workspace-id>
```

### notion/apps/mcp
```
NOTION_API_URL=http://localhost:3001
NOTION_API_KEY=demo-secret-key-for-mcp
MCP_MODE=http
MCP_HTTP_PORT=3002
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 구현 범위 요약

| 작업 | 파일 | 난이도 |
|---|---|---|
| DEMO_MODE 미들웨어 | `apps/api/src/index.ts` | 낮음 |
| 스킵 버튼 UI | `apps/web/src/app/(auth)/login/page.tsx` | 낮음 |
| MCP HTTP transport 추가 | `apps/mcp/src/index.ts` | 중간 |
| A2A Agent Card 엔드포인트 | `apps/mcp/src/index.ts` | 낮음 |
| A2A JSON-RPC + Claude 루프 | `apps/mcp/src/index.ts` | 높음 |
| MCP 도구 5개 추가 | `apps/mcp/src/index.ts` | 낮음 |
| 의존성 추가 | `apps/mcp/package.json` | 낮음 |

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|---------|
| 1 | CEO | MCP_MODE=all → http only for demo | User decision (P4) | User confirmed | stdio+HTTP lifecycle race condition avoided; demo only needs HTTP mode | MCP_MODE=all |

---

# /autoplan CEO Review

## CURRENT → THIS PLAN → 12-MONTH IDEAL

```
CURRENT                    THIS PLAN               12-MONTH IDEAL
──────────────────────     ──────────────────────  ──────────────────────
stdio-only MCP (15 tools)  HTTP+A2A MCP (20 tools) Multi-agent orchestration
wallet auth only           DEMO_MODE bypass        OAuth + API key auth
no @mention                @NotionWriter agent     Any agent @mention
535-line monolith          ~800-line monolith      Domain-modular tool layer
no tests                   no tests                integration test suite
no observability           no observability        structured logs + traces
```

## What Already Exists

| Sub-problem | Existing code |
|---|---|
| 15 MCP tools | `notion/apps/mcp/src/index.ts` — TOOLS array + switch |
| `apiCall()` HTTP helper | `notion/apps/mcp/src/index.ts:17-45` |
| JWT auth middleware | `notion/apps/api/src/index.ts:75` |
| Login page (wallet) | `notion/apps/web/src/app/(auth)/login/page.tsx` |
| Agent routes | `notion/apps/api/src/routes/agents.js` |
| Comments PATCH/DELETE routes | `notion/apps/api/src/routes/comments.js` |

## NOT in scope (deferred to TODOS.md)

- `/a2a` endpoint authentication (Bearer token guard)
- `DEMO_MODE=true` production safety guard (`NODE_ENV=production` startup check)
- MCP `index.ts` modularization (tools/ directory split)
- Error retry logic for Claude tool-calling loop
- Rate limiting on `/a2a`
- Audit logging for agent actions
- LLM model abstraction (currently hardcodes `claude-sonnet-4-6`)
- Integration tests for A2A flow
- `apiCall()` timeout guard (currently hangs indefinitely if Notion API unresponsive)

## Error & Rescue Registry

| Failure | Trigger | Catches | User sees | Tested? |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` invalid | `/a2a` request | Uncaught 401 from SDK | 500 JSON | No |
| Notion API down mid-loop | `apiCall()` throws | `try/catch` in tool handler | SSE `error` event | No |
| SSE client disconnects mid-stream | Network drop | No handler | Partial response, server keeps running | No |
| `DEMO_MODE=true` in production | Misconfigured env | None | All requests pass as demo user | No |
| Port 3002 unreachable from API | Networking issue | None | API 500 when calling `/a2a` | No |
| `prisma.user.upsert()` fails in DEMO_MODE | DB unavailable | None | 500 on every request | No |

## Failure Modes Registry

| Mode | Severity | Addressed in plan? |
|---|---|---|
| Demo user upsert on every request (N+1 Prisma) | Medium | No — needs memoization |
| Agent writes partial page then fails (idempotency) | High | No |
| A2A caller with no auth (open port 3002) | High | No |
| `DEMO_MODE=true` leaks to production | Critical | No |
| MCP server OOM under concurrent A2A requests | Medium | No |
| Claude SDK call takes >60s, SSE hangs | Medium | No timeout set |
| MCP_MODE=all stdio closure kills HTTP server | High | Fixed (user confirmed http-only) |

## CEO Completion Summary

**Mode:** SELECTIVE EXPANSION
**Premises:** P1-P3, P5 accepted. P4 modified (MCP_MODE=http only).
**Scope verdict:** Acceptable for demo. NOT acceptable for production without safety guards.
**Critical gaps:** DEMO_MODE production risk, /a2a has no auth, monolith grows without modularization plan.
**Top expansion opportunities (SELECTIVE):**
  - Add `/a2a` Bearer auth (10 lines, in blast radius)
  - Add DEMO_MODE production guard (5 lines, in blast radius)
**Taste decision:** Codex says freeze tools+harden first; Claude says demo scope is fine. User decides.


---

# /autoplan Design Review

## Design Litmus Score: 4/10

### Pass 1: Information Hierarchy
**Issue:** Demo button DOM position is unstable. When `isConnected && !isLoading`, "Disconnect wallet" renders above the demo button, changing the visual stack: `primary → error → disconnect → demo`. But when not connected: `primary → error → demo`. The user's eye lands on different positions depending on connection state.
**Fix:** Anchor demo button as the last child of the card, outside all conditionals. Always last.

### Pass 2: Missing States (Critical)
**Issues:**
1. Demo button renders even when `isLoading=true` (wallet auth in-flight). User can click demo during live wallet connection → ghost redirect.
2. No loading feedback on demo button click. `router.push()` is instant, navigation may take 200-500ms. User double-clicks.
3. No `disabled` state.

**Fix:** Add `{!isLoading && NEXT_PUBLIC_DEMO_WORKSPACE_URL && <button ...>}`. Add `useState(isDemoNavigating)` to show spinner on click.

### Pass 3: User Journey Break
**Issue:** User mid-wallet-auth clicks demo button → navigates away → `handleLogin()` resolves on unmounted component → `router.replace()` fires from nowhere (ghost redirect). The plan has no cancel/cleanup for this scenario.
**Fix:** Add cleanup ref or abort controller. Or simply hide demo button during `isLoading`.

### Pass 4: Specificity
**Issues:**
1. `router.push(url)` in Next.js App Router does NOT navigate to external absolute URLs — it does an SPA push. If `NEXT_PUBLIC_DEMO_WORKSPACE_URL` is an absolute URL, nothing happens. Use `window.location.href` for external, `router.push()` for internal paths.
2. Korean "데모로 시작하기 →" in an otherwise English-only UI — no i18n rationale documented.
3. Missing `type="button"` attribute — if ever placed inside a `<form>`, triggers form submit.

### Pass 5: Accessibility
**Score: 3/10.** Arrow glyph "→" has no `aria-label`. No `aria-busy` during navigation. No `focus-visible` class.

### Auto-decided Design Fixes (write into plan):
| Fix | Decision | Principle |
|---|---|---|
| Add `!isLoading` guard to demo button | AUTO: YES | P5 (explicit over clever) |
| Add `type="button"` | AUTO: YES | P1 (completeness — prevents form submit) |
| Use `window.location.href` for external URLs, `router.push` for internal | AUTO: YES | P5 |
| Korean label | TASTE DECISION | User decides |


---

# /autoplan Eng Review

## Architecture ASCII Diagram

```
CURRENT (535 lines, 1 file):
notion/apps/mcp/src/index.ts
├── apiCall()              [HTTP helper, line 17]
├── TOOLS[15]              [tool definitions, line 49]
├── Zod schemas[15]        [input validation, line 236]
├── Server + handlers      [MCP protocol, line 294]
└── main()                 [StdioServerTransport only, line 525]

AFTER THIS PLAN (~800+ lines, SAME file):
notion/apps/mcp/src/index.ts
├── apiCall()              [unchanged]
├── TOOLS[20]              [+5 tools]
├── Zod schemas[20]        [+5 schemas]
├── Server + handlers      [unchanged]
├── honoApp = new Hono()   [NEW — HTTP server]
│   ├── GET /health
│   ├── GET /.well-known/agent.json
│   ├── POST /mcp          [StreamableHTTPServerTransport]
│   └── POST /a2a          [Claude SDK loop — complex, untested]
└── main()                 [mode check added]

RECOMMENDED SPLIT (30 min, ~30x compression with CC):
notion/apps/mcp/src/
├── index.ts               [~50 lines, entrypoint wiring]
├── tools.ts               [TOOLS array + Zod + dispatch switch]
├── a2a.ts                 [Claude SDK loop + /a2a handler]
└── http.ts                [Hono routes + transports]
```

## Eng Section 1: Architecture Findings

**Critical: Compositional vulnerability** — `/a2a` (no auth) + `DEMO_MODE=true` (no guard) = unauthenticated caller gets full Notion write access via demo identity. Not two isolated issues — one compositional attack. Fix: `/a2a` Bearer auth using `NOTION_API_KEY` (10 lines).

**High: Tool schema drift** — `workspace_id` vs `workspaceId` vs `pageId` naming inconsistency already exists in `TOOLS` array (line 139-143 vs 89-90). Adding 5 more tools without normalization multiplies LLM tool-call mismatch failures.

**High: monolith** — Three distinct responsibilities (MCP protocol, HTTP routing, LLM orchestration) in one file = change-collision hotspot, untestable.

## Eng Section 2: Code Quality

- `apiCall()` at line 17: no timeout — hangs indefinitely if Notion API is unresponsive
- No module boundary between tool definitions and transport
- `DEMO_MODE` upsert runs on every request — no caching of demo user

## Eng Section 3: Test Coverage

| Code path | Test type needed | Exists? |
|---|---|---|
| TOOLS dispatch (15→20) | Unit | ❌ |
| apiCall() helper | Unit + mock | ❌ |
| A2A loop happy path | Integration (Claude mock) | ❌ |
| A2A loop error path | Unit | ❌ |
| A2A loop max iterations | Unit | ❌ |
| SSE streaming | E2E | ❌ |
| DEMO_MODE middleware | Integration | ❌ |
| Demo skip button | Component | ❌ |
| /health endpoint | Integration | ❌ |

**Zero of 9 paths covered.** Minimum viable: unit test for tool dispatch + Claude SDK mock for loop happy/error path.

## Eng Section 4: Performance & Security

| Issue | Severity | Fix |
|---|---|---|
| A2A loop: no timeout (could run forever) | High | `AbortController` + 60s wall-clock timeout |
| A2A loop: no iteration cap | High | Max 10 tool calls per request |
| SSE client disconnect: loop keeps running | Medium | Wire `req.signal` into Claude SDK call |
| apiCall() no timeout | Medium | `AbortSignal.timeout(10000)` in fetch |
| DEMO_MODE upsert per request | Medium | Module-level memoization after first upsert |
| /a2a no Bearer auth | Critical | `NOTION_API_KEY` check on route |
| DEMO_MODE=true production guard missing | Critical | Startup check: `NODE_ENV=production` throws |

## Eng Completion Summary

**Critical gaps: 2** — compositional vuln (/a2a + DEMO_MODE), zero test coverage on A2A loop
**High: 4** — monolith, schema drift, loop timeout, no iterations cap
**Medium: 3** — SSE disconnect, apiCall timeout, demo upsert per request

**Test plan artifact written below (Section 3).**


---

# /autoplan DX Review [subagent-only]

## DX Scorecard

| Dimension | Score | Key Issue |
|---|---|---|
| 1. Getting started (TTHW) | 3/10 | No quickstart, no single command, 10+ min |
| 2. API/CLI naming | 7/10 | MCP_MODE values guessable, but env summary had wrong value (fixed) |
| 3. Error messages | 3/10 | Invalid ANTHROPIC_API_KEY → opaque 500, no actionable message |
| 4. Documentation | 5/10 | Missing Claude Desktop config block, workspace ID unexplained |
| 5. Escape hatches | 6/10 | Most vars overridable, but model hardcoded, no per-route DEMO override |
| 6. Upgrade path | 8/10 | stdio users: add MCP_MODE=stdio (explicit), backward-compatible |
| **Overall** | **5/10** | TTHW: 10+ min → target: 5 min |

## Developer Journey

| Stage | Current | Issue |
|---|---|---|
| 1. Install | `npm install` in mcp/ | Not documented |
| 2. Configure | Set 5 env vars | Scattered across 3 sections, no ordering |
| 3. Start API | `DEMO_MODE=true ...` | Not documented as prerequisite |
| 4. Start MCP | `MCP_MODE=http npx tsx src/index.ts` | Buried in data flow section |
| 5. Verify | `curl /health` | Not mentioned |
| 6. Claude Desktop | Add `claude_desktop_config.json` | **MISSING ENTIRELY** |
| 7. Test @mention | `@NotionWriter ...` | No end-to-end test steps |

## Auto-decided DX Fixes (applied to spec)

| Fix | Decision | Effort |
|---|---|---|
| `MCP_MODE=all` → `MCP_MODE=http` in env summary | AUTO: DONE | 2 min |
| Catch Anthropic 401 → return actionable error | AUTO: ADD to scope | 1 hour |
| Add MODEL_ID env var override | AUTO: ADD to scope | 30 min |
| Add workspace ID explanation | AUTO: ADD to spec | 5 min |

## Missing from spec (add before implementation):

```bash
# Quickstart (add to spec top)
cd notion/apps/api && DEMO_MODE=true NOTION_API_KEY=demo-secret bun run dev
cd notion/apps/mcp && NOTION_API_URL=http://localhost:3001 \
  NOTION_API_KEY=demo-secret MCP_MODE=http \
  ANTHROPIC_API_KEY=sk-ant-... npx tsx src/index.ts
curl http://localhost:3002/health  # → {"status":"ok"}
```

```json
// Missing: claude_desktop_config.json (stdio mode)
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["tsx", "notion/apps/mcp/src/index.ts"],
      "env": {
        "NOTION_API_URL": "http://localhost:3001",
        "NOTION_API_KEY": "your-key-here",
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

## TTHW Assessment
- **Current:** 10+ minutes (need to read entire spec to reconstruct startup order)
- **Target:** 5 minutes
- **Gap:** Missing quickstart block, missing Claude Desktop config, MCP_MODE inconsistency (fixed)


---

## Cross-Phase Themes (autoplan synthesis)

Issues raised independently by 3+ review phases — highest confidence signals.

| # | Theme | Phases | Severity | Auto-decided? |
|---|---|---|---|---|
| 1 | **DEMO_MODE production safety** | CEO + Eng | Critical | YES: startup guard `if (NODE_ENV=production && DEMO_MODE)` |
| 2 | **No auth on /a2a endpoint** | CEO + Eng | Critical | YES: Bearer token check using NOTION_API_KEY |
| 3 | **Monolith growth (800+ lines)** | CEO + Eng | High | YES: split into `tools.ts` / `a2a.ts` / `http.ts` / `index.ts` |
| 4 | **No test coverage** | CEO + Eng + DX | High | YES: 9-path test plan created (see test plan file) |
| 5 | **TTHW > 10 min** | Design + DX | Medium | YES: quickstart block + Claude Desktop config added to spec |

All 5 themes auto-decided (no taste involved). Applied to scope.


---

## Taste Decision Log (autoplan Phase 4)

| # | Phase | Question | User Choice |
|---|---|---|---|
| T1 | CEO | 데모 범위 우선순위 | 현재 범위대로 진행 (Claude 추천) |
| T2 | Design | 로그인 버튼 언어 | 영어로 통일 → "Try Demo →" (Codex 추천) |
| T3 | Eng | 배포 리스크 분류 | Medium (Claude 추천) |

