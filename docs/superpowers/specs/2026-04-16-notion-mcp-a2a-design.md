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
    데모로 시작하기 →
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
MCP_MODE=all
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
