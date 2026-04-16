# User Flow: A2A Agent Collaboration in Notion

## Overview

사용자가 Notion 워크스페이스에 접속하여 A2A 에이전트를 등록하고, 문서 내에서 멘션으로 에이전트를 호출해 콘텐츠를 생성하고, 멀티 에이전트 협업을 거쳐 최종 퍼블리시까지 이르는 전체 플로우.

---

## 1. 워크스페이스 접속

1. 사용자가 Notion 앱에 로그인한다.
2. 이미 생성되어 있는 워크스페이스 목록에서 원하는 워크스페이스를 선택한다.
3. 사이드바에 페이지 목록, 멤버 목록, 에이전트 목록이 표시된다.

## 2. 사용자 초대

1. 워크스페이스 설정 또는 사이드바의 멤버 섹션에서 "Invite" 버튼을 클릭한다.
2. 초대할 사용자의 이메일을 입력하고 초대 링크를 발송한다.
3. 초대받은 사용자가 링크를 통해 워크스페이스에 참여한다.
4. 새 멤버가 사이드바 멤버 목록에 나타난다.

## 3. A2A 에이전트 등록 (Import)

1. 사이드바 하단의 "Agents" 섹션에서 "+" 버튼을 클릭한다.
2. Agent Invite 모달이 열린다.
3. 에이전트의 A2A URL을 입력한다.
   - 예: `https://writer-agent.example.com`
4. 시스템이 `/.well-known/agent.json`에서 Agent Card를 가져와 미리보기를 표시한다.
   - 에이전트 이름, 설명, 보유 스킬 목록
5. "Add to Workspace" 버튼을 클릭하면 에이전트가 워크스페이스 멤버로 등록된다.
6. 사이드바 Agents 섹션에 에이전트가 나타나며, 온라인/오프라인 상태가 표시된다.

### 등록 예시

| Agent | A2A URL | Skills |
|-------|---------|--------|
| Writer Agent | `https://writer-agent.example.com` | article-writing, summarization |
| Review Agent | `https://review-agent.example.com` | fact-checking, grammar-review, style-review |
| Publisher Agent | `https://publisher-agent.example.com` | formatting, seo-optimization, publishing |

## 4. 문서에서 에이전트 호출 (@멘션)

1. 워크스페이스 내 페이지를 열거나 새 페이지를 생성한다.
2. 문서 편집기에서 `@`를 입력하면 멘션 드롭다운이 나타난다.
   - 사용자와 에이전트가 구분되어 표시된다 (에이전트는 로봇 아이콘).
3. 호출할 에이전트를 선택한다.
4. 멘션 뒤에 프롬프트를 작성한다.

### 호출 형식

```
@agent-name -{skill-name} 프롬프트 내용
```

### 호출 예시

```
@Writer-Agent -article-writing 트럼프의 최근 관세 정책에 대한 분석 기사를 써 줘.
경제적 영향과 국제 반응을 포함해서 2000자 내외로 작성해.
```

5. **Enter 키**를 누르면 에이전트 호출이 트리거된다.
6. 시스템이 A2A `message/send` 프로토콜로 에이전트에 프롬프트를 전송한다.

## 5. 에이전트 콘텐츠 작성

1. Writer Agent가 프롬프트를 수신한다.
2. 에이전트가 MCP를 통해 Notion 문서에 직접 콘텐츠를 작성한다.
   - Hocuspocus Y.Doc을 통해 실시간으로 텍스트가 나타난다.
   - 에이전트의 커서가 문서에 표시되어 작성 과정이 실시간으로 보인다.
3. 기사 작성이 완료되면 에이전트가 완료 메시지를 반환한다.

### 문서 상태 (작성 완료 후)

```
📄 트럼프 관세 정책 분석

@Writer-Agent -article-writing 트럼프의 최근 관세 정책에 대한 분석 기사를 써 줘.

---

[Writer Agent가 작성한 기사 본문]

트럼프 전 대통령의 관세 정책이 글로벌 무역 질서에 미치는 영향을...
(2000자 내외의 분석 기사)
```

## 6. 멀티 에이전트 협업 (리뷰 체인)

Writer Agent가 작성을 마친 후, 자동으로 또는 사용자의 추가 멘션을 통해 다른 에이전트를 호출한다.

### 시나리오 A: 에이전트가 직접 다른 에이전트 호출

1. Writer Agent가 작성 완료 후, 워크스페이스 레지스트리(`/api/v1/agents/registry`)를 조회한다.
2. Review Agent를 발견하고 A2A 프로토콜로 리뷰를 요청한다.
3. Review Agent가 기사를 읽고 문서에 리뷰 코멘트를 작성한다.

```
💬 Review Agent 코멘트:
- ✅ 사실 관계 확인 완료
- ⚠️ 2문단의 수치 인용 출처가 필요합니다
- 💡 결론 부분에 향후 전망 추가를 권장합니다
```

4. Writer Agent가 리뷰 피드백을 반영해 기사를 수정한다.
5. 수정 완료 후 Review Agent에 재검토를 요청한다.
6. Review Agent가 최종 승인한다.

### 시나리오 B: 사용자가 직접 리뷰 에이전트 호출

```
@Review-Agent -fact-checking 위에 Writer Agent가 쓴 기사를 팩트체크하고 리뷰해 줘.
```

## 7. 최종 퍼블리시

리뷰가 완료된 문서를 퍼블리시하는 두 가지 방법이 있다.

### 방법 A: Notion Share에서 직접 Publish

1. 문서 우측 상단의 "Share" 버튼을 클릭한다.
2. "Publish to web" 옵션을 선택한다.
3. 공개 범위와 URL을 설정한다.
4. "Publish" 버튼을 클릭해 퍼블리시한다.

### 방법 B: A2A Human Approve로 Publish (권장)

A2A 프로토콜의 `human-in-the-loop` 승인 메커니즘을 활용한다.

1. 리뷰가 완료되면 Publisher Agent(또는 마지막 리뷰 에이전트)가 "Publish 승인 요청"을 보낸다.
2. 문서 상단 또는 사이드바에 승인 요청 배너가 나타난다.

```
┌─────────────────────────────────────────────────┐
│  📋 Publish Approval Request                    │
│                                                 │
│  "트럼프 관세 정책 분석" 기사가 리뷰를 통과했습니다.  │
│  퍼블리시하시겠습니까?                              │
│                                                 │
│  Reviewed by: Review Agent ✅                    │
│  Word count: 2,103                              │
│  Fact-check: Passed                             │
│                                                 │
│  [ Approve & Publish ]    [ Reject ]            │
└─────────────────────────────────────────────────┘
```

3. 사용자가 **"Approve & Publish"** 버튼 하나를 클릭한다.
4. A2A 프로토콜의 `human_approval` 응답이 전송된다.
5. Publisher Agent가 승인을 수신하고 자동으로 퍼블리시를 실행한다.

---

## 전체 플로우 다이어그램

```
사용자                    Notion                     Agents
  │                        │                          │
  ├── 로그인 ──────────────>│                          │
  ├── 워크스페이스 선택 ────>│                          │
  ├── 사용자 초대 ─────────>│── 초대 링크 발송 ────────>│
  │                        │                          │
  ├── Agent URL 입력 ──────>│── Agent Card 조회 ──────>│ Writer Agent
  │                        │<─ Card 응답 ─────────────│
  ├── Add to Workspace ───>│── 에이전트 등록 ─────────>│
  │                        │                          │
  ├── @Writer-Agent ──────>│                          │
  │   프롬프트 + Enter     │── A2A message/send ─────>│ Writer Agent
  │                        │                          │── 기사 작성 (MCP/Y.Doc)
  │   (실시간 작성 확인)   │<─ 실시간 편집 ───────────│
  │                        │                          │
  │                        │                          │── A2A 레지스트리 조회
  │                        │                          │── Review 요청 ────────>│ Review Agent
  │                        │<─ 리뷰 코멘트 ───────────│                       │
  │                        │                          │<─ 수정 요청 ──────────│
  │                        │<─ 기사 수정 ─────────────│ Writer Agent
  │                        │                          │── 재검토 요청 ────────>│ Review Agent
  │                        │                          │<─ 최종 승인 ──────────│
  │                        │                          │
  │  ┌──────────────────┐  │                          │
  │  │ Approve & Publish│  │── human_approval ───────>│ Publisher Agent
  │  └──────────────────┘  │                          │── Publish 실행
  │                        │<─ 퍼블리시 완료 ─────────│
  │                        │                          │
  ▼                        ▼                          ▼
```

---

## 핵심 기술 스택

| 구간 | 기술 |
|------|------|
| 에이전트 등록 | A2A Agent Card (`/.well-known/agent.json`) |
| 에이전트 호출 | A2A `message/send`, `message/stream` (JSON-RPC 2.0) |
| 문서 편집 | Tiptap v3 + ProseMirror Mention Extension |
| 실시간 협업 | Hocuspocus + Yjs CRDT (WebSocket) |
| 에이전트 작성 | MCP over HTTP/SSE → Hocuspocus Y.Doc |
| 에이전트 간 통신 | A2A 프로토콜 + 워크스페이스 레지스트리 |
| 사용자 승인 | A2A Human-in-the-loop (`human_approval`) |
| 퍼블리시 | Notion Share / A2A Approve 버튼 |
