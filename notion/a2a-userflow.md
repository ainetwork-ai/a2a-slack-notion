# A2A 기능 사용자 플로우

Notion 클론에 통합된 A2A(Agent-to-Agent) 프로토콜 기능의 전체 사용 시나리오.

---

## 준비: 워크스페이스 셋업

새 워크스페이스를 만들거나 기존 워크스페이스에 접속한다.
사이드바 하단에 **Members** 섹션과 **Agents** 섹션이 구분되어 표시된다.

---

## Flow 1 — 에이전트 추가

> 목적: A2A 프로토콜을 따르는 외부 에이전트를 워크스페이스 멤버로 등록한다.

### 1.1 에이전트 초대 모달 열기

사이드바 **Agents** 섹션 우측의 `+` 버튼을 클릭한다.
**Add Agent** 모달이 열린다.

### 1.2 Agent URL 입력 및 프리뷰

```
Agent A2A URL: https://my-agent.example.com
```

URL을 입력하고 돋보기 버튼(또는 Enter)을 누른다.
백엔드가 `/.well-known/agent.json` 또는 `/.well-known/agent-card.json`을 조회해
에이전트 카드를 가져온다.

프리뷰 카드에 다음이 표시된다:
- 에이전트 이름 / 설명
- 아이콘 (있을 경우)
- 지원 스킬 목록 (예: `summarize`, `review`, `translate`)

### 1.3 에이전트 등록

**Add Agent** 버튼을 클릭하면 `POST /api/v1/agents`가 호출된다.
백엔드가 에이전트를 `isAgent: true`인 사용자 레코드로 DB에 저장하고 워크스페이스 멤버십을 생성한다.

등록 완료 후:
- 사이드바 **Agents** 섹션에 에이전트가 나타난다 (🤖 아이콘 + 이름)
- **Members** 섹션에는 표시되지 않는다 (인간 멤버와 분리)

---

## Flow 2 — 에이전트에게 @멘션으로 요청

> 목적: 문서 편집 중 `@에이전트명 프롬프트` 패턴으로 에이전트를 호출하고 응답을 에디터에 받는다.

### 2.1 문서 열기

워크스페이스의 임의 페이지를 열고 협업 에디터가 로드되길 기다린다.
상단에 초록 점 + **Connected** 표시가 뜨면 준비 완료.

### 2.2 에이전트 멘션

에디터 빈 줄에서 `@` 를 입력한다.
멘션 드롭다운이 열리며 두 그룹으로 구분된다:

```
── 워크스페이스 멤버 ──
  👤 Alice
  👤 Bob

────── Agents ──────
  🤖 My Agent          [Agent]
  🤖 Review Bot        [Agent]
```

키보드 방향키 또는 클릭으로 에이전트를 선택한다.
에디터에 하이라이트된 멘션 노드가 삽입된다.

### 2.3 프롬프트 작성

멘션 뒤에 이어서 요청 텍스트를 입력한다.

```
@My Agent 이 페이지의 핵심 내용을 세 줄로 요약해줘
```

### 2.4 Enter로 호출

**Enter** 키를 누른다.

내부적으로:
1. `AgentMentionTrigger`가 `isAgent: true`인 멘션 노드를 감지
2. 멘션 뒤 텍스트를 프롬프트로 추출
3. `POST /api/v1/agents/invoke?stream=true` 호출

---

## Flow 3 — 스트리밍 응답 확인

> 목적: 에이전트가 응답하는 동안 실시간으로 타이핑 상태와 내용을 확인한다.

### 3.1 타이핑 인디케이터

에디터 상단에 에이전트 배지가 나타난다:

```
● My Agent is writing...
```

배지는 에이전트별 고유 색상으로 구분된다.

### 3.2 응답 삽입

SSE(Server-Sent Events) 스트림으로 청크가 도착할 때마다
에디터 커서 위치에 텍스트가 실시간으로 삽입된다.

스트리밍 완료 후 타이핑 인디케이터가 사라진다.

### 3.3 스트리밍 실패 시 폴백

네트워크 오류 등으로 SSE가 실패하면
자동으로 `POST /api/v1/agents/invoke` (non-streaming)을 재시도해
전체 응답을 한 번에 삽입한다.

---

## Flow 4 — 다중 에이전트 자동 체이닝

> 목적: 하나의 에이전트가 응답한 직후, 워크스페이스에 `review` 스킬을 가진 에이전트가 있으면 자동으로 검토를 수행한다.

### 사전 조건

워크스페이스에 두 에이전트가 등록되어 있다:
- **Writer Agent** — 콘텐츠 생성 담당
- **Review Bot** — 스킬 ID에 `review` 또는 `fact` 포함

### 플로우

1. `@Writer Agent 블로그 초안 작성해줘` + Enter
2. Writer Agent의 응답이 에디터에 스트리밍됨
3. 응답 완료 직후 백엔드가 같은 워크스페이스 내 review 스킬 에이전트를 자동 탐색
4. Review Bot이 발견되면 Writer Agent의 출력을 입력으로 자동 호출

에디터에서는 두 에이전트의 타이핑 인디케이터가 순차적으로 표시된다:

```
● Writer Agent is writing...   →   ● Review Bot is writing...
```

최종 출력: Writer Agent의 초안 + Review Bot의 피드백이 이어서 삽입된다.

---

## Flow 5 — 에이전트 상태 및 관리

> 목적: 등록된 에이전트의 상태를 확인하고 필요시 제거한다.

### 5.1 헬스 체크

사이드바의 에이전트 항목에서 컨텍스트 메뉴를 열어 **Check Status**를 선택하면
`POST /api/v1/agents/:agentId/health`가 호출된다.

응답에 따라 에이전트 상태가 업데이트된다:
- `online` — 초록 점
- `offline` — 빨간 점

### 5.2 스킬 확인

에이전트 항목 클릭 시 `GET /api/v1/agents/:agentId/skills`로 스킬 목록을 조회할 수 있다.

```
My Agent의 스킬:
  · summarize   — 문서 요약
  · translate   — 언어 번역
  · extract     — 핵심 정보 추출
```

### 5.3 에이전트 제거

사이드바 에이전트 항목 hover 시 나타나는 `×` 버튼을 클릭하면
`DELETE /api/v1/agents/:agentId`가 호출되고 워크스페이스에서 제거된다.

---

## Flow 6 — 사람 멘션과의 공존

> 목적: 기존 사용자 @멘션이 에이전트 기능과 충돌 없이 동작함을 확인한다.

### 6.1 사람 멘션

`@Alice` 를 입력하고 Enter 누른다.
멘션 노드가 삽입되지만 `isAgent: false` 이므로 **invoke가 트리거되지 않는다.**
이후 `@HumanName` 은 기존처럼 알림만 발송된다.

### 6.2 혼용 시나리오

같은 블록에 사람 멘션과 에이전트 멘션이 함께 있어도
에이전트 멘션(`isAgent: true`)만 invoke된다.

```
@Alice @My Agent 아래 내용 검토 부탁드립니다
```

Enter 시:
- Alice에게는 @멘션 알림 (기존 동작)
- My Agent에게는 invoke 요청 (신규 동작)

---

## 전체 플로우 요약

```
사이드바 [+] 클릭
  → URL 입력 → 프리뷰 → Add Agent
    → 에이전트가 Agents 섹션에 등록됨

페이지 열기 → 에디터에서 @ 입력
  → 드롭다운에서 에이전트 선택 (🤖 배지)
    → 프롬프트 입력 → Enter
      → 타이핑 인디케이터 표시
        → SSE 스트리밍 → 에디터에 응답 삽입
          → (review 에이전트 있으면) 자동 체이닝
```

---

## API 엔드포인트 참조

| 목적 | 메서드 | 경로 |
|------|--------|------|
| 에이전트 카드 프리뷰 | GET | `/api/v1/agents/card?url=...` |
| 에이전트 등록 | POST | `/api/v1/agents` |
| 에이전트 목록 | GET | `/api/v1/agents?workspace_id=...` |
| 에이전트 호출 (스트리밍) | POST | `/api/v1/agents/invoke?stream=true` |
| 에이전트 호출 (일반) | POST | `/api/v1/agents/invoke` |
| 헬스 체크 | POST | `/api/v1/agents/:id/health` |
| 스킬 조회 | GET | `/api/v1/agents/:id/skills` |
| 에이전트 삭제 | DELETE | `/api/v1/agents/:id` |
| 멘션 suggestion | GET | `/api/v1/mentions/suggest?type=agent&...` |
