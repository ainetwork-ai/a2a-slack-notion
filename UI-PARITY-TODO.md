# Slack UI Parity — 차이점 TODO

실제 Slack과 비교해서 빠져있거나 형태가 다른 것들. 위에서부터 눈에 띄는 순서.

## Top Bar (가장 눈에 띄는 차이)

Slack: 화면 전체 맨 위에 어두운 보라색 띠. 우리 앱엔 없음 — 좌 sidebar + 메인
컨텐츠로 바로 들어감.

- [ ] **Top bar 컴포넌트 추가**. 높이 40~44px, workspace color 배경 (`#4a154b`)
- [ ] **History 화살표** (←, →) 왼쪽. 방문 스택 기반 브라우저 이동
- [ ] **시간 네비** (실제 slack에는 없지만 스택 있으면 최근 위치 하이라이트)
- [ ] **검색 바** 정중앙, 넓이 ~700px (`border-white/20`, rounded-md,
      icon prefix, `Search <workspace-name>` placeholder)
  - 클릭 → 현재 `SearchModal` 열기
  - `/` 키로 포커스 (cmd+K도 병행)
  - 최근 검색어 prefill
- [ ] **Help 메뉴** 오른쪽 (? 아이콘) — 단축키 모달 / 피드백 / 문서 링크
- [ ] **현재 유저 아바타** 맨 오른쪽 with status dot — 클릭 시 drop-down
      (status 바꾸기 / 프로필 / 로그아웃). 지금은 rail 하단에 있음.

## Left Rail (68px sidebar)

Slack에선 `Home / DMs / Activity / Later / More` 기본 + 워크스페이스 스위처 하단.

- [ ] **Rail 아이콘 순서** 정리: Home (house) · DMs · Activity · Later · More.
      현재 순서 확인 필요.
- [ ] **Unread count 배지** 각 rail 아이콘 위 우측 상단 빨간 점
- [ ] **Rail 아이콘 상단/하단 구분**: 네비 ↑ / 워크스페이스 스위처 + 유저 ↓
- [ ] **"Create New" 플로팅 버튼** (Slack의 compose pencil) — 오른쪽 하단 원형

## Channel Sidebar (가운데 컬럼)

- [ ] **Workspace 헤더** — 이름 + `v` (클릭 시 Invite / Preferences / Admin 메뉴
      드롭다운). 지금은 `v` 있고 modal 열리는데 slack은 메뉴가 먼저
- [ ] **"New message" / "New canvas" 원 아이콘 버튼** — workspace 이름 오른쪽
- [ ] **섹션 헤더**: `Channels` / `Direct messages` / `Apps` (Slack은 section
      expand/collapse + `+`버튼 한 줄에). 우리는 `+` 버튼 위치·스타일 다름
- [ ] **채널 이름 앞 prefix**: `#`, `🔒` (private), `🔊` (huddle). 현재 Hash icon만
- [ ] **섹션 접기/펴기** 왼쪽 ▶ 아이콘 hover 시 나오게
- [ ] **"Show more" / "Show less"** — 섹션 아이템 5개+ 일 때 접기

## Channel Header

Slack: `# name | topic` + 우측에 member avatars (3–5 stacked) + 버튼들 (Huddle,
Call, Files, Pin, Bookmark, Settings, Search).

- [ ] **토픽 inline 편집** 채널명 옆 (우리는 description 필드로 대신)
- [x] **Member avatar 겹쳐 표시** (3~4명 + `+N`) 우측에, 클릭하면 멤버 패널 열기
- [ ] **Huddle / Call 버튼** placeholder라도 자리 잡기
- [x] **Bookmarks 바** 채널 헤더 아래 작게 — pinned files/canvases/URLs

## Message list

- [x] **Message group hover 영역** Slack 스타일 (좌측 7px 줄 hover highlight)
- [x] **시간 표시 호버만** — 첫 메시지 외엔 시간 숨기고 hover 시 보이기
- [x] **"New messages" divider** (lastReadAt 위치에) 가로선 + "New" 라벨
- [x] **Jump to present 버튼** 스크롤 올라갔을 때 하단 floating
- [x] **Thread reply 미리보기** 부모 메시지 아래 "3 replies · Last reply ~2h ago"
      + 참여자 avatar stack
- [x] **Reactions** "+" 버튼 크기와 위치 (Slack은 inline at end)

## Message input

- [x] **툴바 재배치** — bold/italic/strike · link · list · code · blockquote
      Slack 순서와 동일하게
- [x] **@ mention 드롭다운** skill 아이콘 + 짧은 설명 (agent profile TODO와 연결)
- [x] **Slash command 드롭다운** description 두 줄 표시, keyboard nav
- [x] **"Send later" 버튼** (우측 send 옆 drop-down arrow)
- [x] **"Also send to #channel" 체크박스** thread reply 때

## Right side panels

- [ ] **Thread 패널 헤더** "Thread" 대신 `Thread in #channel` + X 버튼
- [ ] **Canvas 패널** pinned preview UI — Slack은 상단 고정 카드, 우리는 already close
- [ ] **Details panel** (Users/Pinned/Files 탭이 한 패널에 합쳐짐)

## Quick switcher / Search

- [ ] **Cmd+K** 퀵 스위처 — Slack은 채널/DM/유저 한 번에 검색하면서 최근 방문
      위에 보여줌. 우리는 SearchModal이지만 UX 다름
- [ ] **Filter 칩** 검색 결과 상단 (From / In / With / Date)
- [ ] **"Recent" 섹션** 검색 모달 열자마자 최근 채널 / DM 10개

## Mobile

- [ ] **Mobile top bar** 검색 아이콘 + 메뉴 + 워크스페이스 이름 가운데
- [ ] **Bottom tabbar** Home / DMs / Mentions / You 네 개 (Slack iOS 참고)
- [ ] **Swipe actions** 메시지 왼쪽/오른쪽 swipe으로 reply / bookmark

## 우선순위 제안

1. **Top bar + 검색 바** (사용자가 명시) — 프로덕트 정체성
2. Channel header (avatars, bookmarks bar) — 채널 첫인상
3. Message list 디테일 (hover, new messages divider, thread preview)
4. Quick switcher
5. 나머지
