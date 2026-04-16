# Notion Clone — Master Implementation Plan

> **Spec:** `.omc/specs/deep-interview-notion-clone.md` (11-round deep interview, 19.5% ambiguity — PASSED)
> **Arch:** Everything is a Block. Page = root Block, Database = special Block.
> **Stack:** Next.js 15 + Tiptap v3 + Hono + Hocuspocus + Prisma + PostgreSQL

---

## Feature Status Overview

| Layer | Feature | Status |
|-------|---------|--------|
| **Core** | Block editor (text, heading, list, code, callout, divider…) | ✅ Done |
| **Core** | Page create / edit / delete | ✅ Done |
| **Core** | Sidebar (tree, favorites, recent, trash) | ✅ Done |
| **Core** | Slash commands (/) | ✅ Done |
| **Core** | Page icon & cover image | ✅ Done |
| **Core** | Breadcrumb navigation | ❌ Missing |
| **Core** | Block drag & drop (reorder, nest) | ❌ Missing |
| **Core** | Block color & background color | ❌ Missing |
| **Core** | Inline styles (bold, italic, underline, strikethrough, code, link, color) | ✅ Partial |
| **Core** | Page history / version restore | ❌ Missing |
| **Core** | Export (Markdown, PDF) | ✅ Partial |
| **Core** | Import (Markdown, Notion export) | ✅ Partial |
| **Data** | Database block (inline & full-page) | ❌ Missing |
| **Data** | Database properties (20+ types) | ❌ Missing |
| **Data** | Table view | ❌ Missing |
| **Data** | Board view (Kanban) | ❌ Missing |
| **Data** | List view | ❌ Missing |
| **Data** | Calendar view | ❌ Missing |
| **Data** | Gallery view | ❌ Missing |
| **Data** | Timeline view (Gantt) | ❌ Missing |
| **Data** | View filters, sorts, grouping | ❌ Missing |
| **Data** | Formula engine | ❌ Missing |
| **Data** | Relations & Rollups | ❌ Missing |
| **Data** | Database templates (per-item) | ✅ Partial |
| **Collab** | Real-time editing (Hocuspocus + Yjs) | ✅ Done |
| **Collab** | User cursors & presence | ✅ Done |
| **Collab** | Workspace user invite (link-based) | ✅ Done |
| **Collab** | Member list & remove member | ✅ Done |
| **Collab** | Comments (block-level) | ❌ Missing UI |
| **Collab** | Comment threads (resolve/unresolve) | ❌ Missing |
| **Collab** | Mentions (@user, @page, @date) | ✅ Partial |
| **Collab** | Page permissions (Full/Edit/Comment/View) | ❌ Missing UI |
| **Collab** | Share links (public/private) | ❌ Missing UI |
| **Collab** | Notifications (mention, comment, update) | ❌ Missing UI |
| **Collab** | User profile & online status | ❌ Missing |
| **Extensions** | AI assistant (vLLM, OpenAI-compatible) | ❌ Missing |
| **Extensions** | Templates (gallery + user-created) | ✅ Partial |
| **Extensions** | Embeds (oEmbed, YouTube, Figma…) | ❌ Missing |
| **Extensions** | KaTeX math rendering | ❌ Missing |
| **Extensions** | Mermaid diagrams | ❌ Missing |
| **Extensions** | Full-text search (Meilisearch) | ✅ Partial |
| **Extensions** | Automation (trigger-action rules) | ❌ Missing UI |
| **Extensions** | Web clipper | ❌ Missing |
| **Integration** | REST API (Notion-compatible) | ✅ Partial |
| **Integration** | MCP server (stdio) | ✅ Done |
| **Integration** | MCP HTTP/SSE transport | ❌ Missing |
| **Integration** | Webhooks | ❌ Missing UI |
| **Integration** | API Keys management UI | ❌ Missing UI |
| **A2A** | Agent registration (by URL) | ✅ Done |
| **A2A** | Agent sidebar list + status | ✅ Done |
| **A2A** | Agent mention (@Agent + Enter trigger) | ✅ Done |
| **A2A** | MCP HTTP/SSE for external agents | ❌ Missing |
| **A2A** | Agent cursors via Hocuspocus | ❌ Missing |
| **A2A** | Multi-agent A2A communication | ❌ Missing |
| **Infra** | Docker Compose (full stack) | ✅ Partial |
| **Infra** | Nginx reverse proxy | ❌ Missing |
| **Infra** | Redis pub/sub | ❌ Missing |
| **Infra** | MinIO file storage | ❌ Missing |

---

## Part A: A2A Agent Integration (Phases 1–8)

> **상세 구현 플랜은 하단 "A2A Plan Detail" 섹션 참고**

| Phase | Goal | Status |
|-------|------|--------|
| Phase 1 | Prisma 스키마 — Agent 필드 추가 | ✅ Done |
| Phase 2 | A2A Client (fetchAgentCard, sendA2AMessage) | ✅ Done |
| Phase 3 | MCP HTTP/SSE Transport 추가 | ❌ Pending |
| Phase 4 | MCP-Yjs Bridge (에이전트 커서) | ❌ Pending |
| Phase 5 | Agent Mention 시스템 (에디터 @+Enter) | ✅ Done |
| Phase 6 | Multi-Agent A2A Communication | ❌ Pending |
| Phase 7 | Frontend UI (AgentInviteModal, AgentList) | ✅ Done |
| Phase 8 | End-to-End 통합 & 검증 | ❌ Pending |

---

## Part B: Missing Notion Features

---

### Phase 9: Workspace Members & Invite ✅ Done

**구현 완료** (2026-04-15)

**스키마:**
```prisma
model WorkspaceInvite {
  id          String        @id @default(cuid())
  workspaceId String        @map("workspace_id")
  token       String        @unique @default(cuid())
  role        WorkspaceRole @default(member)
  createdBy   String        @map("created_by")
  expiresAt   DateTime?     @map("expires_at")
  createdAt   DateTime      @default(now()) @map("created_at")
  workspace   Workspace     @relation(...)
  @@map("workspace_invites")
}
```

**API:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/workspaces/:id/members` | 멤버 목록 |
| `POST` | `/api/v1/workspaces/:id/invites` | 초대 링크 생성 (admin) |
| `DELETE` | `/api/v1/workspaces/:id/members/:userId` | 멤버 제거 (admin) |
| `GET` | `/api/v1/invites/:token` | 초대 미리보기 (비인증 가능) |
| `POST` | `/api/v1/invites/:token/accept` | 초대 수락 |

**프론트엔드:**
- `components/sidebar/member-list.tsx` — 사이드바 Members 섹션
- `components/workspace/invite-modal.tsx` — 링크 생성 + 복사 모달
- `app/invite/[token]/page.tsx` — 초대 수락 페이지

---

### Phase 10: Breadcrumb Navigation

**Goal:** 현재 페이지의 계층 경로를 에디터 상단에 표시한다.

**파일:**
- `notion/apps/web/src/components/editor/breadcrumb.tsx` (새 파일)
- `notion/apps/web/src/app/workspace/[workspaceId]/[pageId]/page.tsx` 수정

**구현:**
- 현재 페이지의 조상 블록 목록을 `/api/v1/pages/:id` 응답에서 추출
- 클릭 시 해당 페이지로 이동
- 아이콘 + 제목 표시, 마지막 항목은 현재 페이지

---

### Phase 11: Block Drag & Drop

**Goal:** 블록을 드래그하여 순서 변경 및 중첩 구조 변경.

**Dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable` (이미 설치 여부 확인)

**파일:**
- `notion/apps/web/src/components/editor/` 내 DnD 통합

**구현:**
- 블록 좌측 드래그 핸들 (hover 시 표시)
- sortable 컨텍스트로 블록 순서 변경
- 드롭 시 `/api/v1/blocks/:id` PATCH로 `parent_id` + `children_order` 업데이트

---

### Phase 12: Block Styling (Color & Background)

**Goal:** 블록별 텍스트 색상 및 배경색 지정.

**구현:**
- 블록 툴팁/컨텍스트 메뉴에 색상 팔레트 추가
- `properties.color`, `properties.bgColor` JSONB 필드 활용
- Tiptap node 속성으로 색상 전달

---

### Phase 13: Page History & Version Restore

**Goal:** 페이지 변경 이력을 보고 이전 버전으로 복원한다.

**현재:** `PageSnapshot` 모델 있음, API 라우트 (`history.ts`) 있음.

**누락:**
- History 패널 UI
- 버전 비교 diff 표시
- 특정 버전으로 복원

**파일:**
- `notion/apps/web/src/components/history/history-panel.tsx` (새 파일)
- 에디터 우상단 "History" 버튼 → 패널 오픈

**API (확인 필요):**
- `GET /api/v1/pages/:id/history` — 스냅샷 목록
- `POST /api/v1/pages/:id/history/:snapshotId/restore` — 복원

---

### Phase 14: Database Block & Views

**Goal:** 노션의 핵심 기능 — 인라인/풀페이지 데이터베이스와 6가지 뷰.

**규모:** 이 Phase는 가장 복잡하므로 14a~14f로 분리.

#### Phase 14a: Database Core (스키마 + API)

**스키마 추가:**
```prisma
model DatabaseProperty {
  id          String   @id @default(cuid())
  databaseId  String   @map("database_id")
  name        String
  type        String   // title|text|number|select|multi_select|date|person|
                       // files|checkbox|url|email|phone|formula|relation|rollup|
                       // created_time|created_by|last_edited_time|last_edited_by|status
  config      Json     @default("{}")  // options for select, formula expression, etc.
  position    Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")

  database Block @relation("DatabaseProperties", fields: [databaseId], references: [id], onDelete: Cascade)

  @@index([databaseId, position])
  @@map("database_properties")
}

model DatabaseItem {
  id          String   @id @default(cuid())
  databaseId  String   @map("database_id")
  pageId      String   @unique @map("page_id")  // 각 row는 Page (Block)
  properties  Json     @default("{}")            // { propertyId: value }
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  database Block @relation("DatabaseItems", fields: [databaseId], references: [id], onDelete: Cascade)

  @@index([databaseId])
  @@map("database_items")
}
```

**API:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/databases` | 데이터베이스 생성 |
| `GET` | `/api/v1/databases/:id` | 데이터베이스 정보 + 프로퍼티 스키마 |
| `PATCH` | `/api/v1/databases/:id` | 데이터베이스 이름/프로퍼티 수정 |
| `POST` | `/api/v1/databases/:id/query` | 아이템 쿼리 (filter, sort, pagination) |
| `POST` | `/api/v1/databases/:id/items` | 새 아이템 생성 |
| `PATCH` | `/api/v1/databases/:id/items/:itemId` | 아이템 프로퍼티 업데이트 |
| `DELETE` | `/api/v1/databases/:id/items/:itemId` | 아이템 삭제 |
| `GET` | `/api/v1/databases/:id/views` | 뷰 목록 |
| `POST` | `/api/v1/databases/:id/views` | 새 뷰 생성 |
| `PATCH` | `/api/v1/databases/:id/views/:viewId` | 뷰 설정 변경 |

#### Phase 14b: Table View

**파일:** `notion/apps/web/src/components/database/views/table-view.tsx`

- 가로 스크롤 테이블
- 헤더: 프로퍼티 이름 + 타입 아이콘, 너비 조절
- 셀 인라인 편집 (클릭 시 input)
- 하단 "New" 행 추가
- 컬럼 추가 (+) 버튼

#### Phase 14c: Board View (Kanban)

**파일:** `notion/apps/web/src/components/database/views/board-view.tsx`

- `select` 또는 `status` 프로퍼티로 그룹핑
- 컬럼 간 카드 드래그 (dnd-kit)
- 컬럼별 새 카드 추가

#### Phase 14d: List View

**파일:** `notion/apps/web/src/components/database/views/list-view.tsx`

- 단순 목록, 각 아이템은 클릭 시 페이지로 이동
- 표시 프로퍼티 선택 가능

#### Phase 14e: Calendar View

**파일:** `notion/apps/web/src/components/database/views/calendar-view.tsx`

- `date` 프로퍼티를 기준으로 월 캘린더에 표시
- 날짜 클릭 시 새 아이템 생성

#### Phase 14f: Gallery View

**파일:** `notion/apps/web/src/components/database/views/gallery-view.tsx`

- 카드 그리드 레이아웃
- 커버 이미지 (files 프로퍼티 또는 페이지 cover) 표시

#### Phase 14g: Timeline View (Gantt)

**파일:** `notion/apps/web/src/components/database/views/timeline-view.tsx`

- 시작일/종료일 `date` 프로퍼티를 가로 Gantt 바로 표시
- 줌 레벨: 일/주/월

#### Phase 14h: View Filters & Sorts

**파일:** `notion/apps/web/src/components/database/filter-sort-panel.tsx`

- 각 뷰별 필터 조건 (AND/OR 논리)
- 다중 정렬 키 지원
- 뷰 설정을 `DatabaseView.filters`, `.sorts` JSONB에 저장

---

### Phase 15: Database Properties

**Goal:** 20개 프로퍼티 타입 지원.

**구현 우선순위:**

| 우선순위 | 타입 | 비고 |
|---------|------|------|
| 🔴 필수 | title, text, number, select, multi_select, date, checkbox, url, status | |
| 🟡 중요 | person, files, email, phone, created_time, created_by, last_edited_time | |
| 🟢 고급 | formula, relation, rollup | 별도 Phase |

**파일:** `notion/apps/web/src/components/database/properties/`
- `property-cell.tsx` — 타입별 셀 렌더러
- `property-editor.tsx` — 셀 편집 UI (select dropdown, date picker 등)
- `property-config.tsx` — 프로퍼티 설정 (select 옵션 추가 등)

---

### Phase 16: Formula, Relations & Rollups

**Goal:** 데이터베이스 간 연결 및 집계.

**스키마 추가:**
```prisma
model DatabaseRelation {
  id              String @id @default(cuid())
  propertyId      String @unique @map("property_id")
  targetDatabaseId String @map("target_database_id")
  syncedPropertyId String? @map("synced_property_id")  // 양방향 관계
  @@map("database_relations")
}
```

**Formula Engine:**
- Notion formula syntax 파서 구현 (또는 `formula.js` 라이브러리 활용)
- 지원 함수: if, and, or, not, add, subtract, multiply, divide, concat, length, format, toNumber, now, dateAdd, dateBetween 등

---

### Phase 17: Comments & Discussions

**Goal:** 블록 단위 댓글 + 스레드.

**현재:** `Comment` 모델 있음, `comments.ts` 라우트 있음.

**누락된 UI:**

**파일:**
- `notion/apps/web/src/components/comments/comment-panel.tsx`
- `notion/apps/web/src/components/comments/comment-bubble.tsx` — 블록 우측 댓글 아이콘

**기능:**
- 블록 선택 후 댓글 아이콘 hover → 댓글 입력
- 댓글 패널: 스레드 목록, 답글 작성
- Resolve/Unresolve 토글
- 댓글 있는 블록에 하이라이트 표시

---

### Phase 18: Page Permissions & Sharing

**Goal:** 페이지별 접근 권한 설정 및 공유 링크.

**현재:** `PagePermission` 모델, `ShareLink` 모델, `permissions.ts`, `share.ts` 라우트 있음.

**누락된 UI:**

**파일:**
- `notion/apps/web/src/components/share/share-panel.tsx`

**기능:**
- 에디터 상단 "Share" 버튼 → 패널 오픈
- 멤버별 권한 레벨 설정 (Full Access / Can Edit / Can Comment / Can View)
- 공개 링크 생성 (can_view 기본)
- 링크 복사 버튼

---

### Phase 19: Notifications

**Goal:** 멘션, 댓글, 페이지 변경 알림.

**현재:** `Notification` 모델, `notifications.ts` 라우트 있음.

**누락된 UI:**

**파일:**
- `notion/apps/web/src/components/notifications/notification-panel.tsx`
- 사이드바 상단 또는 헤더에 알림 벨 아이콘

**기능:**
- 읽지 않은 알림 개수 뱃지
- 알림 목록 (클릭 시 해당 페이지로 이동)
- 읽음 처리
- SSE 또는 polling으로 실시간 알림

---

### Phase 20: AI Assistant (vLLM)

**Goal:** 인라인 AI 어시스턴트로 텍스트 생성, 요약, 번역.

**API:**
- `POST /api/v1/ai/complete` — 선택 텍스트 + 명령 → 생성 결과 (SSE 스트리밍)

**vLLM 설정:**
- `VLLM_BASE_URL`, `VLLM_MODEL` 환경 변수
- OpenAI-compatible API (`/v1/chat/completions`)

**UI:**
- `/` 커맨드 메뉴에 AI 옵션 추가: "Ask AI", "Summarize", "Translate", "Fix spelling"
- 텍스트 선택 후 툴팁에 AI 버튼
- 스트리밍 응답을 블록에 실시간 삽입

**파일:**
- `notion/apps/api/src/routes/ai.ts` (새 파일)
- `notion/apps/web/src/components/editor/ai-assistant.tsx`

---

### Phase 21: Embeds & Rich Media

**Goal:** URL 임베드, 외부 서비스, 파일 미리보기.

**Tiptap 확장:**
- `EmbedExtension` — URL → oEmbed API 조회 → iframe/preview 렌더링
- 지원: YouTube, Figma, CodePen, Google Maps, Twitter/X
- PDF 임베드 (react-pdf 또는 iframe)
- 오디오/비디오 파일 플레이어

**파일:**
- `notion/apps/web/src/components/editor/extensions/embed.ts`
- `notion/apps/api/src/routes/oembed.ts` — 서버사이드 oEmbed 프록시

---

### Phase 22: KaTeX Math & Mermaid Diagrams

**Goal:** 수식과 다이어그램 블록.

**KaTeX:**
- `/equation` 슬래시 커맨드로 수식 블록 추가
- 인라인 수식: `$...$`
- Tiptap KaTeX extension

**Mermaid:**
- Code 블록 타입에 `language: "mermaid"` 지원
- 저장 시 SVG 렌더링
- 편집 모드 ↔ 미리보기 모드 토글

**패키지:** `katex`, `mermaid`

---

### Phase 23: Full-Text Search (Meilisearch)

**현재:** `search.ts` 라우트 있음.

**Goal:** Meilisearch 연동으로 실제 전문 검색.

**구현:**
- `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` 환경 변수
- 페이지/블록 저장 시 Meilisearch 인덱스 업데이트 (BullMQ 큐 활용)
- 검색 결과: 페이지 제목 + 블록 내용 하이라이팅

**파일:**
- `notion/apps/api/src/lib/search/meilisearch.ts`
- `notion/apps/api/src/lib/queues/search-index.ts` (BullMQ worker)

---

### Phase 24: Automation Engine

**Goal:** 간단한 trigger → action 워크플로우.

**현재:** `Automation` 모델, `automations.ts` 라우트 있음.

**트리거 타입:**
- `page.created`, `page.updated`, `property.changed`, `date.reached`

**액션 타입:**
- `notify.user`, `update.property`, `create.page`, `send.webhook`

**UI:**
- `notion/apps/web/src/components/automation/automation-editor.tsx`
- 데이터베이스 우상단 "Automate" 버튼

**실행:**
- BullMQ 지연 잡 (date.reached)
- 이벤트 훅 (나머지)

---

### Phase 25: Webhooks & API Keys UI

**Goal:** 외부 시스템 연동을 위한 웹훅 관리 및 API 키 발급 UI.

**현재:** `Webhook`, `ApiKey` 모델, `webhooks.ts`, `api-keys.ts` 라우트 있음.

**누락된 UI:**
- 워크스페이스 설정 페이지 (`/workspace/:id/settings`)
  - Webhooks 탭: URL + 이벤트 선택 + 시크릿
  - API Keys 탭: 키 목록 + 새 키 발급 + 삭제

---

### Phase 26: Import / Export (Complete)

**현재:** `import.ts`, `export.ts` 라우트 있음 (부분 구현).

**Goal:**
- **Export:** Markdown, PDF (puppeteer/playwright 서버사이드 렌더링), CSV (데이터베이스)
- **Import:** Markdown 파일 업로드, Notion export ZIP 파싱

**PDF:**
- `notion/apps/api/src/lib/export/pdf.ts` — Playwright headless 렌더링

---

### Phase 27: User Profile & Online Status

**Goal:** 사용자 프로필 편집 및 실시간 온라인 상태.

**스키마 수정:**
- `User` 모델에 `status: String? ("online"|"away"|"offline")`, `bio: String?` 추가

**UI:**
- 사이드바 하단 현재 사용자 아바타 + 이름 → 클릭 시 프로필 패널
- Hocuspocus awareness로 온라인 상태 동기화
- 멤버 목록에서 온라인 표시

---

### Phase 28: Docker & Production Deploy

**Goal:** 전체 스택을 Docker Compose로 한 번에 배포.

**서비스:**
```yaml
services:
  postgres:    # PostgreSQL 16
  redis:       # Redis 7
  minio:       # MinIO (S3-compatible)
  meilisearch: # Meilisearch
  api:         # Hono API (port 3011)
  web:         # Next.js (port 3000)
  nginx:       # Reverse proxy
```

**파일:**
- `notion/docker-compose.yml` (개발용) — 확인/완성
- `notion/docker-compose.prod.yml` (프로덕션)
- `notion/nginx/nginx.conf`
- `notion/.env.example`

---

## Part C: A2A Plan Detail (Phases 1–8)

*(원본 상세 계획 유지)*

### Architecture

```
User types "@AgentA analyze this" + Enter
  │
  ▼
Tiptap Mention Extension (type=agent)
  │
  ▼
POST /api/v1/agents/invoke  { agentId, prompt, pageId, blockId }
  │
  ▼
Notion API Server (Hono)
  │── A2A Client: sendA2AMessage(agentA.url, prompt)
  │     │
  │     ▼
  │   AgentA (external A2A server)
  │     │── GET /api/v1/agents?workspace_id=xxx  (레지스트리 조회)
  │     │── A2A call: sendA2AMessage(agentB.url, sub-task)
  │     ▼
  │   AgentA & AgentB → MCP HTTP tools
  │     │
  │     ▼
  MCP HTTP Server (port 3003)
    │── Read ops  → REST API
    │── Write ops → Hocuspocus Y.Doc (에이전트 커서 표시)
```

### Phase 1: Database Schema ✅

- `User.isAgent`, `User.a2aUrl`, `User.agentCardJson`, `User.agentStatus` 추가
- `walletAddress` nullable (에이전트는 지갑 없음)

### Phase 2: A2A Client ✅

**파일:** `notion/apps/api/src/lib/a2a/`
- `client.ts` — `fetchAgentCard()`, `sendA2AMessage()`, `streamA2AMessage()`
- `agent-manager.ts` — `inviteAgent()`, `removeAgent()`, `healthCheck()`
- `agent-invoker.ts` — 에이전트 호출 + MCP 연동

### Phase 3: MCP HTTP/SSE Transport ❌

**파일:** `notion/apps/mcp/src/http-server.ts`

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// HTTP endpoint: POST /mcp
// Port 3003
// Auth: Authorization: Bearer <api-key>
```

**신규 MCP 도구:**
- `get_workspace_agents` — 에이전트 레지스트리 조회
- `invoke_agent` — 다른 에이전트 A2A 호출
- `get_document_context` — 현재 문서 전체 텍스트
- `set_cursor_position` — 커서 위치 설정

### Phase 4: MCP-Yjs Bridge ❌

**파일:** `notion/apps/mcp/src/lib/hocuspocus-bridge.ts`

```typescript
class AgentSession {
  provider: HocuspocusProvider;  // ws://localhost:3002
  ydoc: Y.Doc;
  // token: `agent:${agentId}`
  // awareness: { name, color, isAgent: true }
}
```

**Streaming write:** 3글자씩 50ms 간격으로 Y.Doc에 삽입 → 실시간 타이핑 효과

### Phase 5: Agent Mention System ✅

- `mentions.ts` — `type=agent` 지원 추가
- `extensions.ts` — 사용자+에이전트 통합 suggest
- `mention-list.tsx` — 로봇 아이콘 + 스킬 태그 + 그룹 분리
- `agent-mention-handler.ts` — Enter 트리거 ProseMirror 플러그인

### Phase 6: Multi-Agent A2A ❌

**레지스트리 API:** `GET /api/v1/agents/registry?workspace_id=xxx`

**흐름:**
```
AgentA → get_workspace_agents → 스킬 매칭 → invoke_agent(B) 
→ AgentB 호출 → 두 에이전트 동시 편집 → 두 커서 모두 표시
```

**안전장치:** 호출 깊이 최대 5, contextId로 순환 감지

### Phase 7: Frontend UI ✅

- `agent-invite-modal.tsx` — URL 입력 → Agent Card 프리뷰 → 등록
- `agent-list.tsx` — 사이드바 Agents 섹션
- `agent-card.tsx` — 에이전트 상세 정보
- `agent-activity-panel.tsx` — 편집 중인 에이전트 표시

### Phase 8: Integration & E2E ❌

**검증 시나리오:**
1. A2A URL로 에이전트 등록 → 사이드바 표시
2. 에디터에서 `@AgentA 기사 써줘` + Enter
3. AgentA 커서 나타남 → 레지스트리 조회 → AgentB 호출
4. 두 에이전트 커서 동시 표시 + 실시간 타이핑
5. 완료 후 커서 사라짐

---

## Implementation Priority

```
지금 진행 중
├─ Phase 9: Workspace Invite           ✅ Done
│
다음 구현 순서 (권장)
├─ Phase 10: Breadcrumb               (작음, 빠름)
├─ Phase 17: Comments UI              (모델/API 있음)
├─ Phase 19: Notifications UI         (모델/API 있음)
├─ Phase 18: Permissions & Sharing UI (모델/API 있음)
├─ Phase 13: Page History UI          (모델/API 있음)
├─ Phase 14a: Database Core           (새 스키마 필요)
├─ Phase 14b: Table View              (14a 이후)
├─ Phase 14c: Board View              (14a 이후)
├─ Phase 14d–g: 나머지 뷰             (14b 이후)
├─ Phase 15: Database Properties      (14a와 병렬)
├─ Phase 20: AI Assistant             (독립)
├─ Phase 22: KaTeX & Mermaid          (독립)
├─ Phase 3–4: MCP HTTP + Yjs Bridge   (A2A Phase 3-4)
├─ Phase 6: Multi-Agent A2A           (Phase 3-4 이후)
├─ Phase 8: A2A E2E                   (Phase 6 이후)
└─ Phase 28: Docker Production        (마지막)
```

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 초대 방식 | 링크 기반 (이메일 없음) | Auth가 walletAddress 기반 |
| DB 아이템 모델 | DatabaseItem (별도 테이블) | Block과 분리하여 프로퍼티 관리 용이 |
| Formula 엔진 | 자체 파서 or `formula.js` | Notion syntax 호환성 |
| AI | 사내 vLLM (OpenAI-compatible) | 외부 API 의존성 제거 |
| 검색 | Meilisearch | 빠른 전문 검색, 자체 호스팅 가능 |
| 에이전트 발견 | 레지스트리 조회 | 에이전트 간 자율적 협업 |
| MCP 쓰기 | Hocuspocus Y.Doc (Yjs) | 에이전트 커서 실시간 표시 |

---

## Key File Map

### API (`notion/apps/api/src/`)
| File | Layer |
|------|-------|
| `routes/workspaces.ts` | Members + Invite ✅ |
| `routes/invites.ts` | Invite accept ✅ |
| `routes/agents.ts` | A2A ✅ |
| `routes/databases.ts` | Database (확장 필요) |
| `routes/comments.ts` | Comments (UI 누락) |
| `routes/notifications.ts` | Notifications (UI 누락) |
| `routes/permissions.ts` | Permissions (UI 누락) |
| `routes/share.ts` | Share (UI 누락) |
| `routes/ai.ts` | AI Assistant (신규) |
| `lib/a2a/client.ts` | A2A ✅ |
| `lib/a2a/agent-manager.ts` | A2A ✅ |
| `lib/search/meilisearch.ts` | Search (신규) |

### Web (`notion/apps/web/src/`)
| File | Layer |
|------|-------|
| `components/sidebar/member-list.tsx` | Members ✅ |
| `components/workspace/invite-modal.tsx` | Invite ✅ |
| `app/invite/[token]/page.tsx` | Invite accept ✅ |
| `components/database/` | Database (신규) |
| `components/comments/` | Comments (신규) |
| `components/notifications/` | Notifications (신규) |
| `components/share/` | Sharing (신규) |
| `components/history/` | History (신규) |
| `components/editor/ai-assistant.tsx` | AI (신규) |
| `components/editor/breadcrumb.tsx` | Breadcrumb (신규) |
