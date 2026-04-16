# Notion Database — Cleanroom Implementation Plan

> **목적**: Notion의 데이터베이스 기능 전체를 역분석하여, 현재 구현 상태를 정리하고 누락된 기능의 구현 방향을 명확히 정의한다.
> **기준**: 이 문서는 코드를 복사하지 않고, 기능 동작을 관찰/분석한 cleanroom 명세이다.

---

## 1. 데이터 모델 아키텍처

```
Block (type="database")
├── properties: JSONB
│   ├── title: string
│   ├── icon: string | null
│   ├── coverUrl: string | null
│   └── schema: { properties: PropertyDefinition[] }
│
├── DatabaseView[] (별도 테이블)
│   ├── type: ViewType (table|board|list|calendar|gallery|timeline)
│   ├── filters: FilterGroup (logic, conditions[])
│   ├── sorts: SortRule[]
│   ├── groupBy: GroupRule | null
│   └── config: ViewConfig (visibleProperties, columnWidths, ...)
│
└── DatabaseTemplate[] (별도 테이블)
    ├── name, description, icon
    ├── content: TemplateBlock[]  ← 행에 붙을 문서 콘텐츠
    └── values: Record<propertyId, PropertyValue>

DatabaseRow = Block (type="database_row")
├── databaseId: FK → Block
└── properties: { values: Record<propertyId, PropertyValue> }
```

**핵심 원칙**:
- 모든 것은 Block이다. Page, Database, Row 모두 Block 테이블의 레코드.
- `properties: JSONB`에 타입별 설정 정보 저장. Prisma 모델 변경 없이 스키마 확장 가능.
- Computed 속성(formula, rollup)은 저장하지 않고 **조회 시점에 계산**한다.
- 관계(Relation)는 자동으로 역방향 property를 상대 DB에 생성한다.

---

## 2. Property Types (속성 타입) — 20종

### 2-1. 직접 입력 (Editable)

| 타입 | 값 형태 | 설명 | 구현 상태 |
|------|---------|------|----------|
| `title` | `{ type, value: string }` | 행의 기본 이름. 항상 첫 번째 열. 삭제 불가. | ✅ 완료 |
| `text` | `{ type, value: string }` | 멀티라인 텍스트. 리치 텍스트 가능. | ✅ 완료 |
| `number` | `{ type, value: number, format: NumberFormat }` | 숫자. 포맷 옵션 7종. | ✅ 완료 |
| `select` | `{ type, value: SelectOption }` | 단일 선택. 옵션에 색상 지정. | ✅ 완료 |
| `multi_select` | `{ type, value: SelectOption[] }` | 다중 선택. | ✅ 완료 |
| `date` | `{ type, value: DateValue }` | 날짜 또는 날짜 범위. 시간 포함 옵션. | ✅ 완료 |
| `person` | `{ type, value: string[] }` | 워크스페이스 멤버 ID 배열. 다중 지정 가능. | ✅ 완료 |
| `files` | `{ type, value: FileValue[] }` | 파일 첨부. name, url, size, mimeType. | ✅ 완료 |
| `checkbox` | `{ type, value: boolean }` | 불리언 토글. | ✅ 완료 |
| `url` | `{ type, value: string }` | URL 필드. 클릭시 외부 링크 오픈. | ✅ 완료 |
| `email` | `{ type, value: string }` | 이메일 주소. | ✅ 완료 |
| `phone` | `{ type, value: string }` | 전화번호. | ✅ 완료 |
| `status` | `{ type, value: SelectOption, groups: StatusGroup[] }` | 상태. 기본 그룹(To Do/In Progress/Done). select와 유사하나 그룹 개념 포함. | ✅ 완료 |

**NumberFormat** 7종: `number`, `number_with_commas`, `percent`, `dollar`, `euro`, `won`, `yen`

**DateValue 구조**:
```typescript
interface DateValue {
  start: string;       // ISO 8601
  end?: string;        // 날짜 범위
  includeTime: boolean;
  timezone?: string;
}
```

### 2-2. 자동 계산 (Computed, Read-Only)

| 타입 | 값 형태 | 설명 | 구현 상태 |
|------|---------|------|----------|
| `formula` | `FormulaResult` | 수식 표현식 평가 결과. 저장 안 함, 조회 시 계산. | ✅ 완료 |
| `relation` | `{ type, value: string[] }` | 다른 DB 행 ID 배열. 양방향 자동 동기화. | ✅ 완료 |
| `rollup` | `RollupResult` | relation 통해 연결된 행들의 집계값. | ✅ 완료 |
| `created_time` | `{ type, value: string }` | 행 생성 시각 (ISO). 자동 입력. | ✅ 완료 |
| `created_by` | `{ type, value: string }` | 행 생성자 ID. 자동 입력. | ✅ 완료 |
| `last_edited_time` | `{ type, value: string }` | 마지막 수정 시각. 자동 갱신. | ✅ 완료 |
| `last_edited_by` | `{ type, value: string }` | 마지막 수정자 ID. 자동 갱신. | ✅ 완료 |

**누락된 Notion 최신 타입**:

| 타입 | 설명 | 구현 상태 |
|------|------|----------|
| `id` | DB 내 고유 자동증가 숫자 ID (Notion ID 속성) | ❌ 미구현 |
| `button` | 버튼 클릭 시 자동화 트리거 | ❌ 미구현 |
| `verification` | 콘텐츠 검증 상태 (Verified/Unverified/Expired) | ❌ 미구현 |
| `unique_id` | 데이터베이스별 고유 식별자 (prefix 포함) | ❌ 미구현 |

---

## 3. Views (뷰) — 6종 + Chart

### 3-1. Table View (테이블 뷰)

**역할**: 스프레드시트 형태. 모든 행·열을 격자로 표시.

**현재 구현**:
- 컬럼 순서: title → 나머지 visible properties
- 컬럼 너비 조절 (columnWidths, handleResize)
- 행 번호 표시 (1-based rowIndex + 1)
- 행 hover시 삭제 버튼 + sub-items 토글
- 행 hover시 title 열에 ExternalLink 아이콘 → Row Detail Modal
- `+ New` 버튼으로 행 추가 (템플릿 있으면 TemplatePicker 먼저)
- `+` 버튼으로 속성 추가 (AddPropertyMenu)
- Sub-items (하위 행, parentRowId) 토글
- 빈 상태(0행) → EmptyState 컴포넌트

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  visibleProperties?: string[];    // 보이는 컬럼 ID 목록
  columnWidths?: Record<string, number>;  // 컬럼 너비
}
```

**누락 기능**:
- [ ] 드래그&드롭 행 순서 변경
- [ ] 컬럼 드래그&드롭 순서 변경
- [ ] 행 선택 (체크박스) + 일괄 작업 (bulk operations)
- [ ] 행 복제 (Duplicate row)
- [ ] Calculation row (하단 집계 행: sum, count, avg, ...)
- [ ] Frozen columns (컬럼 고정)
- [ ] Row height 옵션 (Small/Medium/Large)

---

### 3-2. Board View (보드 뷰, 칸반)

**역할**: Kanban 보드. select/status 속성 기준으로 컬럼 분류.

**현재 구현**:
- `boardGroupBy` 설정으로 기준 속성 선택
- 각 select 옵션 → 칸반 컬럼
- "No value" 컬럼 (값 없는 행)
- 컬럼당 행 카운트 표시
- 카드 내 주요 속성 미리보기
- 드래그&드롭으로 컬럼 이동 (옵션 값 변경)

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  boardGroupBy?: string;  // 기준 속성 ID (select 또는 status)
}
```

**누락 기능**:
- [ ] 컬럼(그룹) 숨기기/보이기 토글
- [ ] 컬럼 순서 변경
- [ ] 컬럼 색상 커스터마이징
- [ ] 카드 커버 이미지 설정
- [ ] 카드에 표시할 속성 선택
- [ ] 컬럼 내 row limit (+ show more)

---

### 3-3. List View (리스트 뷰)

**역할**: 간결한 목록 형태. 그룹핑 지원.

**현재 구현**:
- groupBy 기준으로 섹션 분류
- 섹션당 4개 속성 미리보기
- 접기/펼치기 (collapsible groups)
- 그룹 내 행 추가

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  groupBy?: string;  // 그룹 기준 속성 ID
}
```

**누락 기능**:
- [ ] 행 클릭 → Row Detail 열기 (현재 구현 확인 필요)
- [ ] Nested sub-items in list
- [ ] 표시 속성 선택

---

### 3-4. Calendar View (캘린더 뷰)

**역할**: 날짜 속성 기준 월별 캘린더.

**현재 구현**:
- `calendarDateProperty` 설정으로 날짜 속성 선택
- 월 이전/다음 네비게이션
- 날짜 범위(start/end) 표시
- 날짜 셀 클릭으로 행 생성
- 각 날짜에 title 속성 표시

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  calendarDateProperty?: string;  // 날짜 속성 ID
}
```

**누락 기능**:
- [ ] Week view (주별 뷰)
- [ ] 날짜 셀에 여러 행 있을 때 "+ N more" 처리
- [ ] 행 드래그&드롭으로 날짜 이동
- [ ] 행 클릭 → Row Detail

---

### 3-5. Gallery View (갤러리 뷰)

**역할**: 카드 그리드. 이미지/커버 강조.

**현재 구현**:
- `galleryCoverProperty` 설정으로 커버 속성 선택
- 카드 크기 옵션 (small/medium/large)
- 커버 없을 때 title 해시로 그라디언트 생성
- 반응형 그리드 레이아웃
- 카드에 여러 속성 미리보기

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  galleryCoverProperty?: string;  // 커버 속성 ID (files 타입 권장)
  cardSize?: 'small' | 'medium' | 'large';
}
```

**누락 기능**:
- [ ] Fit/Crop 이미지 표시 모드 선택
- [ ] 카드에 표시할 속성 선택
- [ ] 카드 클릭 → Row Detail

---

### 3-6. Timeline View (타임라인 뷰, Gantt)

**역할**: 날짜 범위 기반 Gantt 차트.

**현재 구현**:
- `timelineStartProperty`, `timelineEndProperty` 설정
- 줌 레벨 3종 (day/week/month)
- 수평 스크롤 + sticky 사이드바 (200px)
- 날짜 범위 바 (duration bar)
- 행 높이 36px

**ViewConfig 필드**:
```typescript
interface ViewConfig {
  timelineStartProperty?: string;
  timelineEndProperty?: string;
  timelineZoom?: 'day' | 'week' | 'month';
}
```

**누락 기능**:
- [ ] 바 드래그&드롭으로 날짜 변경
- [ ] 바 오른쪽 끝 드래그로 기간 조절
- [ ] 그룹핑 (group by select/status)
- [ ] Year 줌 레벨
- [ ] 오늘 날짜 표시 (Today line)

---

### 3-7. Chart View (차트 뷰)

**역할**: 데이터 시각화. 막대/원형/선 차트.

**현재 구현**: `chart-view.tsx` (11914 lines) 존재. 세부 구현 확인 필요.

**예상 기능**:
- Bar chart, Pie chart, Line chart (기본 3종)
- X축/Y축 속성 선택
- 집계 함수 (count, sum, avg)

**누락 가능성**:
- [ ] Donut chart
- [ ] Area chart
- [ ] Scatter plot
- [ ] Chart export (PNG/SVG)

---

## 4. 필터링 (Filtering)

### 현재 구현

**FilterGroup 구조**:
```typescript
interface FilterGroup {
  logic: 'and' | 'or';
  conditions: FilterCondition[];
}

interface FilterCondition {
  propertyId: string;
  operator: FilterOperator;
  value?: unknown;
}
```

**FilterOperator (19종)**:

| 카테고리 | 연산자 |
|---------|-------|
| 텍스트 | `equals`, `does_not_equal`, `contains`, `does_not_contain`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| 숫자 | `equals`, `does_not_equal`, `greater_than`, `less_than`, `greater_than_or_equal`, `less_than_or_equal`, `is_empty`, `is_not_empty` |
| 날짜 | `equals`, `before`, `after`, `on_or_before`, `on_or_after`, `is_empty`, `is_not_empty` |
| 체크박스 | `is_checked`, `is_not_checked` |

**백엔드 처리**:
- `evaluateCondition(condition, rowProps, schema)` — 단일 조건 평가
- `applyFilters(rows, filters, schema)` — FilterGroup 전체 적용
- `applySorts(rows, sorts, schema)` — SortRule[] 적용

### 누락 기능

- [ ] 중첩 FilterGroup (AND 안에 OR, OR 안에 AND)
- [ ] 날짜 상대값 필터 (`this_week`, `this_month`, `past_week`, `past_month`, `next_week`, `next_month`, `today`, `tomorrow`, `yesterday`)
- [ ] Person 타입 `me` 필터 (현재 로그인 사용자)
- [ ] Select 타입 `any_of` / `none_of` 연산자
- [ ] Formula 결과 필터링
- [ ] 백엔드에서 DB 쿼리 레벨 필터 (현재: 모든 행 조회 후 JS로 필터링 → 성능 이슈 가능성)
- [ ] "필터 없이 모든 행 보기" 옵션 (admin override)

---

## 5. 정렬 (Sorting)

### 현재 구현

```typescript
interface SortRule {
  propertyId: string;
  direction: 'ascending' | 'descending';
}
```

- 다중 정렬 (SortRule 배열)
- 텍스트/숫자/날짜/select 정렬

### 누락 기능

- [ ] 정렬 순서 drag&drop 변경
- [ ] 수동 정렬 (Manual sort — 행 순서를 직접 지정)
- [ ] 정렬 기준 null 처리 (empty last vs empty first)
- [ ] 한국어/유니코드 정렬 locale 적용

---

## 6. 그룹핑 (Grouping)

### 현재 구현

```typescript
interface GroupRule {
  propertyId: string;
  hidden?: string[];  // 숨긴 그룹 ID 목록
}
```

- 단일 속성 기준 그룹핑
- 그룹 숨기기 (hidden)

### 누락 기능

- [ ] Sub-grouping (2단계 그룹)
- [ ] 빈 그룹 숨기기/보이기 설정
- [ ] 그룹 순서 변경
- [ ] 그룹별 집계 (Count per group 하단 표시)

---

## 7. Formula (수식)

### 현재 구현

**파서 아키텍처** (`packages/shared/src/formula.ts`):

```
입력 문자열
    ↓
Lexer (토큰화)
    ↓
Parser (AST 생성, 연산자 우선순위 적용)
    ↓
FormulaNode (AST)
    ↓
Evaluator (행 컨텍스트로 평가)
    ↓
FormulaResult (string | number | boolean | date | error)
```

**연산자 우선순위** (낮음 → 높음):
1. `or`
2. `and`
3. 비교 (`==`, `!=`, `>`, `<`, `>=`, `<=`)
4. 덧셈/뺄셈 (`+`, `-`)
5. 곱셈/나눗셈 (`*`, `/`)
6. 단항 (`-`, `!`)
7. 함수 호출, 속성 참조, 리터럴

**AST Node 타입**:
```typescript
type FormulaNode =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'property'; name: string }
  | { type: 'function'; name: string; args: FormulaNode[] }
  | { type: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | { type: 'unary'; op: string; operand: FormulaNode }
  | { type: 'conditional'; condition: FormulaNode; ifTrue: FormulaNode; ifFalse: FormulaNode }
```

**FormulaEditor UI**: 문법 강조, 자동완성 (12581 lines — 풍부한 구현)

### 누락 기능

- [ ] 날짜 함수 확장: `dateAdd()`, `dateBetween()`, `dateRange()`, `now()`, `today()`
- [ ] 텍스트 함수 확장: `slice()`, `padStart()`, `replace()`, `replaceAll()`
- [ ] 타입 변환 함수: `toNumber()`, `toString()`, `toDate()`
- [ ] 다른 property를 formula에서 참조 시 자동완성 개선
- [ ] Formula 오류 표시 in cell (현재 error 타입만 반환)
- [ ] 조건 삼항 연산자 ternary (`condition ? a : b`) vs if() 통일
- [ ] Property 타입 검증 (formula에서 숫자 필드를 문자열로 쓸 때 경고)

---

## 8. Relation (관계)

### 현재 구현

```typescript
interface RelationConfig {
  relatedDatabaseId: string;
  reversePropertyId?: string;  // 상대 DB에 자동 생성되는 역방향 속성 ID
}
```

**양방향 자동 동기화**:
1. DB A에 relation 속성 생성 → DB B에 reverse property 자동 생성
2. 행 A에서 B 행 연결 → 행 B의 reverse 속성도 자동 업데이트
3. relation 속성 삭제 → reverse property 자동 삭제

**`RelationPicker` UI**: 연결할 행 검색 및 선택

### 누락 기능

- [ ] 단방향 relation (reverse 없는 relation)
- [ ] Relation 필드에서 연결된 행의 속성 인라인 표시
- [ ] 연결 행 수 제한 옵션
- [ ] 순환 참조 방지 (A→B→A 루프 감지)
- [ ] 다중 DB 간 relation 탐색 UI

---

## 9. Rollup (집계)

### 현재 구현

**RollupConfig**:
```typescript
interface RollupConfig {
  relationPropertyId: string;  // relation 속성 기준
  targetPropertyId: string;    // 집계할 타겟 속성
  function: RollupFunction;
}
```

**RollupFunction 12종**:

| 함수 | 설명 |
|------|------|
| `count` | 연결된 행 수 |
| `count_values` | 비어있지 않은 값 수 |
| `sum` | 숫자 합계 |
| `avg` | 숫자 평균 |
| `min` | 최솟값 |
| `max` | 최댓값 |
| `median` | 중앙값 |
| `range` | max - min |
| `percent_empty` | 빈 값 비율 (%) |
| `percent_not_empty` | 채워진 값 비율 (%) |
| `show_original` | 모든 값 배열로 표시 |
| `show_unique` | 중복 제거 후 배열 표시 |

**`RollupConfig` UI**: `rollup-config.tsx`

### 누락 기능

- [ ] Date 타입 rollup (earliest, latest)
- [ ] 체크박스 rollup (percent_checked, percent_unchecked)
- [ ] rollup 결과로 필터/정렬
- [ ] 중첩 rollup (rollup of rollup)

---

## 10. Templates (행 템플릿)

### 현재 구현

```typescript
interface DatabaseTemplate {
  id: string;
  databaseId: string;
  name: string;
  description: string | null;
  icon: string | null;
  content: TemplateBlock[];  // 행에 붙을 문서 블록
  values: Record<string, PropertyValue>;  // 기본 속성 값
  isDefault: boolean;
  position: number;
}
```

**API**:
- `GET /templates` — 목록 조회
- `POST /templates` — 생성
- `PATCH /templates/:tid` — 수정
- `DELETE /templates/:tid` — 삭제
- `POST /rows/from-template/:tid` — 템플릿으로 행 생성 (content + values 복제)

**UI**: `TemplatePicker` (행 추가 시), `TemplateEditor` (편집)

### 누락 기능

- [ ] Default template 설정 (isDefault 플래그 활용)
- [ ] Template 미리보기
- [ ] Template 복제
- [ ] Template에서 date 속성 상대값 설정 (예: "오늘 + 7일")

---

## 11. Row Detail Modal (행 상세 뷰)

### 현재 구현 (`row-detail-modal.tsx`)

- 오른쪽 슬라이드-인 패널 (w-480px, z-modal)
- 제목 인라인 편집
- 모든 non-title 속성 그리드 (레이블 140px + 값 영역)
- PropertyCell 재사용으로 모든 타입 편집 지원
- workspaceId 전달로 Person 멤버 피커 동작

### 누락 기능

- [ ] 행의 페이지 콘텐츠 (Block editor) — 각 행은 자체 문서를 가질 수 있음
- [ ] 전체 화면 전환 버튼
- [ ] 댓글 섹션 (comments on row)
- [ ] 속성 추가 버튼 (+ Add a property)
- [ ] 행 복제 버튼
- [ ] 행 삭제 버튼
- [ ] 행 URL 공유 (직접 링크)
- [ ] 수정 이력 (revision history)

---

## 12. Sub-items (하위 행)

### 현재 구현 (`sub-items-row.tsx`)

- `__parentRowId` 속성으로 계층 구조
- TableRow에서 ▸ 토글 버튼
- depth 인자로 들여쓰기
- `activeView`와 동일한 속성 표시

### 누락 기능

- [ ] 무한 깊이 중첩 (현재 depth=1 고정인지 확인 필요)
- [ ] Sub-items를 View 기준으로 필터/정렬
- [ ] Sub-items 수 표시 (N sub-items)
- [ ] Sub-item 드래그&드롭으로 부모 변경

---

## 13. Database 수준 기능

### 현재 구현

**DB CRUD API** (`routes/databases.ts`):
- `POST /` — 생성 (parentId, workspaceId, 초기 title 속성 자동 생성)
- `GET /:id` — 조회 (schema + views 포함)
- `PATCH /:id` — 수정 (title, icon, coverUrl, archived)
- `DELETE /:id` — 삭제 (행, 뷰, 템플릿 cascade)

**Inline vs Full-page**:
- `<DatabaseView inline={true} />` prop으로 인라인 표시 지원
- 페이지 안에 DB 블록으로 삽입 가능

### 누락 기능

- [ ] **Linked Database View** — 같은 DB를 다른 페이지에서 다른 뷰로 표시
- [ ] **CSV Import** — CSV 파일로 데이터 가져오기
- [ ] **CSV/Markdown Export** — 데이터 내보내기
- [ ] **Database Search** — DB 내 행 전문 검색
- [ ] **Database Lock** — 수정 잠금 (관리자만 편집 가능)
- [ ] **Row count** — 하단 "N rows" 표시
- [ ] **Load more / Pagination** — 대용량 DB 커서 기반 페이징 UI
- [ ] **Database icon/cover** 설정 UI
- [ ] **Duplicate database** — DB 복제
- [ ] **Database 전체 페이지** 전환 (inline → full-page)
- [ ] **Multiple DB connection** — 같은 행을 여러 DB에 노출

---

## 14. Automations (자동화)

### 현재 구현

`createRow` API에서 `triggerAutomations()` 호출 흔적 있음.

### 예상 기능 (미구현)

- [ ] **Trigger**: 행 추가됨, 속성 변경됨, 특정 시각
- [ ] **Action**: 속성 값 설정, 알림 전송, 페이지 생성, 외부 웹훅 호출
- [ ] **Condition**: 필터 조건 기반 실행 여부
- [ ] Automation 규칙 관리 UI

---

## 15. 실시간 협업

### 현재 구현

- Hocuspocus + Yjs로 동시 편집
- 셀 편집 시 `updateRow` PATCH → Zustand 상태 업데이트
- WebSocket을 통한 Document 동기화 (page content 레벨)

### 누락 기능

- [ ] **Database row 실시간 동기화** — 현재 Zustand는 로컬 상태; 다른 사용자의 행 추가/수정이 실시간 반영되지 않을 수 있음
- [ ] **Presence 표시** — 같은 DB를 보고 있는 멤버 아바타
- [ ] **Cell-level locking** — 다른 사용자가 편집 중인 셀 표시

---

## 16. 권한 (Permissions)

### 현재 구현

- 워크스페이스 멤버 조회 API (`/api/v1/workspaces/:id/members`)
- 행 생성자/수정자 추적 (created_by, last_edited_by)

### 누락 기능

- [ ] **DB 레벨 권한** — Full access / Can edit / Can comment / Can view / No access
- [ ] **뷰 레벨 권한** — 특정 뷰만 공유
- [ ] **Public 공유** — 공개 링크 (read-only)
- [ ] **Guest 접근** — 워크스페이스 외부 사용자에게 DB 공유

---

## 17. 성능 고려사항

| 이슈 | 현재 상태 | 권장 대응 |
|------|----------|----------|
| 필터링 방식 | 전체 행 조회 후 JS 필터 | 백엔드 WHERE 절로 이동 |
| Formula 계산 | 조회 시마다 모든 행 재계산 | Formula 결과 캐싱 (행 변경 시 무효화) |
| Rollup 계산 | 조회 시마다 관련 DB 조회 | Materialized rollup 캐싱 |
| 대용량 DB | cursor 기반 pagination 구현 있음 | UI에서 infinite scroll 연동 필요 |
| property-cell.tsx | 21,637 lines 단일 파일 | 타입별 파일 분리 필요 |
| chart-view.tsx | 11,914 lines 단일 파일 | 차트 타입별 컴포넌트 분리 |

---

## 18. 구현 우선순위 로드맵

### Phase 1 — 핵심 UX 완성 (즉시)

1. **Table: 행 드래그&드롭** — 수동 순서 지정
2. **Row Detail: 페이지 콘텐츠 편집** — 각 행에 문서 연결
3. **Row Detail: 속성 추가 버튼**
4. **Board: 컬럼 숨기기/보이기**
5. **Calendar: 오늘 날짜 하이라이트**

### Phase 2 — 데이터 조작 강화 (단기)

6. **필터: 날짜 상대값** (this week, today, ...)
7. **필터: 중첩 FilterGroup**
8. **정렬: 수동 순서 (Manual sort)**
9. **일괄 작업 (Bulk operations)** — 행 선택 + 삭제/속성 일괄 변경
10. **CSV Import/Export**

### Phase 3 — 고급 기능 (중기)

11. **Linked Database View**
12. **Automations** (trigger + action)
13. **DB 레벨 권한**
14. **Row versioning / history**
15. **ID 속성 타입** (unique_id)

### Phase 4 — 성능 & 안정성 (지속)

16. **필터 백엔드 WHERE 절 이동**
17. **Formula/Rollup 캐싱**
18. **Database 실시간 동기화** (row-level Yjs or polling)
19. **property-cell.tsx 파일 분리**
20. **E2E 테스트 확장** (e2e/database.spec.ts)

---

## 19. 파일 구조 참조

```
notion/
├── packages/shared/src/
│   ├── database.ts          ← 모든 타입/인터페이스 정의 (단일 소스)
│   └── formula.ts           ← Formula 파서 + 평가기
│
├── apps/api/src/routes/
│   └── databases.ts         ← 모든 DB API 엔드포인트 (1825 lines)
│
├── apps/api/prisma/
│   └── schema.prisma        ← Block, DatabaseView, DatabaseTemplate 모델
│
└── apps/web/src/
    ├── components/database/
    │   ├── database-view.tsx     ← 메인 컨테이너
    │   ├── table-view.tsx        ← 테이블 뷰
    │   ├── board-view.tsx        ← 보드 뷰
    │   ├── list-view.tsx         ← 리스트 뷰
    │   ├── calendar-view.tsx     ← 캘린더 뷰
    │   ├── gallery-view.tsx      ← 갤러리 뷰
    │   ├── timeline-view.tsx     ← 타임라인 뷰
    │   ├── chart-view.tsx        ← 차트 뷰
    │   ├── property-cell.tsx     ← 셀 렌더러 (20 타입, 21k lines)
    │   ├── property-header.tsx   ← 컬럼 헤더
    │   ├── filter-toolbar.tsx    ← 필터 + 정렬 UI
    │   ├── add-property-menu.tsx ← 속성 추가
    │   ├── option-picker.tsx     ← Select/Status 옵션 선택
    │   ├── relation-picker.tsx   ← Relation 행 선택
    │   ├── rollup-config.tsx     ← Rollup 설정
    │   ├── formula-editor.tsx    ← 수식 편집기 (12k lines)
    │   ├── template-picker.tsx   ← 템플릿 선택
    │   ├── template-editor.tsx   ← 템플릿 편집
    │   ├── row-detail-modal.tsx  ← 행 상세 패널
    │   └── sub-items-row.tsx     ← 하위 행
    │
    └── stores/
        └── database.ts           ← Zustand 상태 관리
```

---

## 20. 신규 기능 추가 체크리스트

새 속성 타입 또는 기능 추가 시 반드시 수정해야 하는 파일:

1. `packages/shared/src/database.ts` — 타입 정의 추가
2. `apps/api/src/routes/databases.ts` — 백엔드 로직 (저장, 계산, 검증)
3. `apps/api/prisma/schema.prisma` — 필요 시 모델 변경 + migration
4. `apps/web/src/components/database/property-cell.tsx` — 셀 UI 렌더러
5. `apps/web/src/components/database/property-header.tsx` — 컬럼 헤더 옵션
6. `apps/web/src/components/database/add-property-menu.tsx` — 생성 메뉴
7. `apps/web/src/components/database/row-detail-modal.tsx` — 상세 뷰
8. `apps/web/src/stores/database.ts` — 필요 시 스토어 액션

---

*Last updated: 2026-04-16*
*Based on: codebase analysis of `/mnt/newdata/git-chanho/a2a-slack-notion/notion`*
