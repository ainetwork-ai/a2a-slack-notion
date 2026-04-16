# Notion 공식 데이터베이스 기능 스펙

> 공식 Notion 데이터베이스의 모든 기능을 정리한 레퍼런스 문서입니다.
> 기준: 2026년 4월 기준 (Notion 3.4)

---

## 목차

1. [데이터베이스 기본 개념](#1-데이터베이스-기본-개념)
2. [프로퍼티 타입 (Property Types)](#2-프로퍼티-타입-property-types)
3. [뷰 타입 (View Types)](#3-뷰-타입-view-types)
4. [필터 (Filter)](#4-필터-filter)
5. [정렬 (Sort)](#5-정렬-sort)
6. [그룹핑 (Grouping)](#6-그룹핑-grouping)
7. [계산 (Calculations)](#7-계산-calculations)
8. [Relations & Rollups](#8-relations--rollups)
9. [수식 (Formula)](#9-수식-formula)
10. [자동화 (Automations)](#10-자동화-automations)
11. [AI 기능](#11-ai-기능)
12. [서브 아이템 & 의존성 (Sub-items & Dependencies)](#12-서브-아이템--의존성-sub-items--dependencies)
13. [스프린트 & 태스크 데이터베이스 (Sprints)](#13-스프린트--태스크-데이터베이스-sprints)
14. [폼 (Forms)](#14-폼-forms)
15. [데이터 소스 (Data Sources)](#15-데이터-소스-data-sources)
16. [권한 & 잠금 (Permissions & Locking)](#16-권한--잠금-permissions--locking)
17. [템플릿 (Templates)](#17-템플릿-templates)
18. [검색 & 기타 기능](#18-검색--기타-기능)

---

## 1. 데이터베이스 기본 개념

- **페이지 기반 아이템**: 데이터베이스의 모든 항목은 Notion 페이지. 행을 열면 텍스트, 이미지 등 콘텐츠를 자유롭게 추가 가능
- **인라인 / 풀페이지 형식**: 페이지 내 임베드(inline) 또는 독립 풀페이지 데이터베이스로 사용 가능
- **프로퍼티로 메타데이터 추가**: 날짜, 상태, 담당자 등 컨텍스트 정보를 항목에 부여
- **다중 뷰**: 동일한 데이터를 테이블, 보드, 캘린더 등 다양한 형태로 시각화

---

## 2. 프로퍼티 타입 (Property Types)

| 프로퍼티 | 설명 |
|---------|------|
| **Text** | 서식 있는 텍스트. 요약, 메모, 설명 등에 사용 |
| **Number** | 숫자값. 통화(Currency)나 진행률 바(Progress bar) 형식으로 표시 가능 |
| **Select** | 단일 선택 옵션. 카테고리 분류에 유용 |
| **Multi-Select** | 복수 선택 옵션. 여러 카테고리로 태깅할 때 사용 |
| **Status** | To-do / In Progress / Complete 3단계로 구분된 진행 상태 추적 |
| **Date** | 날짜 또는 날짜 범위 (시간 포함 선택적). 마감일 등에 활용 |
| **Person** | 워크스페이스 멤버 태깅. 태스크 담당자 지정에 사용 |
| **File & Media** | 파일 및 이미지 첨부. 문서, 사진 보관에 활용 |
| **Checkbox** | 참/거짓 체크박스. 간단한 완료 여부 추적 |
| **URL** | 웹사이트 링크. 클릭 시 새 탭에서 열림 |
| **Email** | 이메일 주소. 클릭 시 메일 클라이언트 실행 |
| **Phone** | 전화번호. 클릭 시 통화 연결 |
| **Formula** | 다른 프로퍼티 값 기반 자동 계산. Notion 수식 언어 사용 |
| **Relation** | 다른 데이터베이스 페이지와 연결. 단방향/양방향 관계 설정 |
| **Rollup** | Relation으로 연결된 데이터베이스의 프로퍼티 값을 집계 |
| **Created time** | 항목 생성 시각 자동 기록. 수정 불가 |
| **Created by** | 항목 생성자 자동 기록. 수정 불가 |
| **Last edited time** | 마지막 편집 시각 자동 갱신. 수정 불가 |
| **Last edited by** | 마지막 편집자 자동 갱신. 수정 불가 |
| **Button** | 클릭 한 번으로 자동화 액션 실행. 프로퍼티 편집, 페이지 추가 등 |
| **ID (Unique ID)** | 항목별 고유 숫자 ID 자동 생성. 접두사(prefix) 설정 가능. 삭제 불가 |
| **Place** | 위치 서비스/주소/지명 입력. 지도 뷰와 연동 |

---

## 3. 뷰 타입 (View Types)

### 3.1 Table (테이블)
- 행=페이지, 열=프로퍼티인 스프레드시트 형태
- 열 숨기기/표시, 열 너비 조절
- 열 고정(Freeze): 수평 스크롤 시 특정 열을 고정
- 행 클릭 시 사이드 피크(Side peek), 센터 피크, 풀페이지로 열기 선택

### 3.2 Board (보드)
- Kanban 스타일. 특정 프로퍼티 값 기준으로 컬럼 생성
- 그룹 기준: Status, Select, Person, Multi-select, Relation 등
- 카드 크기: 대/중/소 선택
- 카드 미리보기: 페이지 커버, 콘텐츠 미리보기, 업로드 이미지
- 이미지 맞춤: Fit / Crop
- 컬럼 컬러 자동 적용 옵션
- 드래그 앤 드롭으로 카드/컬럼 재정렬
- 컬럼별 계산값(합계, 평균, 개수 등) 표시
- 서브그룹(Sub-group) 지원

### 3.3 Timeline (타임라인)
- Gantt 차트 스타일. 항목을 선형 시간축에 배치
- 날짜 범위 프로퍼티 기반으로 막대 표시
- 의존성(Dependencies) 연결 표시
- 시간 범위 단위 조절 (일/주/월/분기/연도)
- 서브그룹 지원

### 3.4 Calendar (캘린더)
- 날짜 프로퍼티 기준으로 월간 캘린더에 항목 표시
- 주간/월간 전환
- 날짜 범위(시작-종료) 표시 지원

### 3.5 List (리스트)
- 미니멀한 1열 목록 형태
- 가장 가벼운 뷰. 빠른 스캔에 적합
- 아이콘, 서브텍스트 프로퍼티 표시

### 3.6 Gallery (갤러리)
- 그리드 형태로 페이지를 카드로 표시
- 페이지 커버 이미지 또는 파일 프로퍼티 이미지 강조
- 카드 크기(소/중/대) 조절
- 디자인 시스템, 영감 보드, 포트폴리오 등에 활용

### 3.7 Chart (차트)
- 데이터 시각화 전용 뷰

**차트 타입:**
| 타입 | 설명 |
|------|------|
| Vertical bar | 수직 막대 차트 |
| Horizontal bar | 수평 막대 차트 |
| Line | 선형 추세 차트 |
| Donut | 도넛(원형 비율) 차트 |
| Number | 단일 숫자 지표 |

**기능:**
- 최대 200개 그룹, 50개 서브그룹 표시
- 드릴다운: 차트 섹션 클릭 시 테이블 뷰로 상세 보기
- PNG/SVG 내보내기
- X축/Y축 프로퍼티, 정렬, 누적 모드 설정
- 색상 팔레트, 높이, 그리드선, 레이블, 레전드 커스터마이징
- 무료 플랜: 1개 차트 / 유료 플랜: 무제한

### 3.8 Dashboard (대시보드)
- 차트, 테이블, 보드, 캘린더, 타임라인 등 여러 위젯을 한 화면에 배치
- 한눈에 현황 파악하는 통합 뷰

### 3.9 Feed (피드)
- 카드 형태로 페이지 콘텐츠(본문 미리보기)를 나열
- 회사 공지, 저널, 블로그 포스트 등 콘텐츠 스캔에 적합
- 프로퍼티 표시 여부 선택 가능

### 3.10 Map (맵)
- Place 프로퍼티의 위치 데이터를 지도에 핀으로 표시
- 지리적 분포 파악에 활용

---

## 4. 필터 (Filter)

### 단순 필터
- 프로퍼티 값 기준으로 항목 표시/숨김
- 모든 프로퍼티 타입에 필터 조건 적용 가능

### 고급 필터 (Advanced Filters)
- AND / OR 논리 결합
- 최대 3단계(레이어) 중첩 필터 그룹
- 복잡한 쿼리 표현 가능 (예: Status=Done AND (Priority=High OR Deadline<Today))

### 필터 적용 범위
- **공유 필터**: 해당 뷰를 보는 모든 사용자에게 적용
- **개인 필터**: 본인에게만 적용 (다른 사용자에게는 보이지 않음)

---

## 5. 정렬 (Sort)

- 프로퍼티 기준으로 표시 순서 변경
- **텍스트**: 알파벳/가나다 순 정렬
- **숫자**: 오름차순/내림차순 정렬
- **Select / Multi-select**: 옵션 커스텀 순서로 정렬
- **날짜, 체크박스, Person** 등 타입별 정렬 로직 적용
- 다중 정렬: 정렬 조건을 드래그로 우선순위 조정

---

## 6. 그룹핑 (Grouping)

- **1단계 그룹**: 특정 프로퍼티 값 기준으로 항목을 접히는 섹션으로 분류
- **2단계 서브그룹**: 기존 그룹 내에서 추가 프로퍼티 기준으로 세부 분류 (예: Status 그룹 → Priority 서브그룹)
- 그룹 숨기기, 수동 정렬 또는 알파벳/숫자 자동 정렬
- 빈 그룹 숨기기 옵션

---

## 7. 계산 (Calculations)

- 테이블 열 하단 푸터에 집계 값 표시
- 보드 뷰 컬럼별 집계 표시

**지원 계산 종류:**
| 계산 | 설명 |
|------|------|
| Count | 항목 수 |
| Count values | 값이 있는 항목 수 |
| Count unique | 고유값 수 |
| Count empty | 빈 항목 수 |
| Count not empty | 비어있지 않은 항목 수 |
| Percent empty | 빈 비율 |
| Percent not empty | 비어있지 않은 비율 |
| Sum | 합계 (Number) |
| Average | 평균 (Number) |
| Median | 중앙값 (Number) |
| Min | 최솟값 (Number) |
| Max | 최댓값 (Number) |
| Range | 범위 (Number) |
| Percent checked | 체크된 비율 (Checkbox) |
| Earliest date | 가장 이른 날짜 |
| Latest date | 가장 늦은 날짜 |
| Date range | 날짜 범위 |

---

## 8. Relations & Rollups

### Relations (관계)
- **단방향 관계**: 현재 데이터베이스에서 다른 데이터베이스 페이지 참조
- **양방향 관계**: 양쪽 데이터베이스 모두에 관계 프로퍼티 자동 생성
- 한 항목에서 여러 페이지 연결 가능
- 자기 자신 데이터베이스 참조 가능 (계층 구조 표현)

### Rollups (롤업)
- Relation으로 연결된 데이터베이스의 프로퍼티 값 집계
- 집계 방식: Count, Sum, Average, Min, Max, Count unique, Count empty, Percent empty, Count checked, Percent checked, Show original, Show unique
- 날짜 집계: Earliest date, Latest date, Date range
- 롤업의 롤업(2단계) 가능 (단, 수식 레이어 제한 15단계)

---

## 9. 수식 (Formula)

- 다른 프로퍼티 값 참조해 동적으로 값 계산
- **기본 연산자**: +, -, *, /, % 등 수학 연산
- **비교 연산자**: ==, !=, <, >, <=, >=
- **논리 함수**: if, and, or, not
- **수학 함수**: abs, ceil, floor, round, sqrt, pow, log, exp 등
- **텍스트 함수**: concat, length, contains, replace, slice, upper, lower 등
- **날짜 함수**: now, dateAdd, dateBetween, formatDate, timestamp 등
- **타입 변환**: toNumber, toString 등
- 수식은 최대 15레이어 깊이 (다른 수식/롤업 참조 포함)
- **Formula AI**: 자연어로 수식 자동 생성

---

## 10. 자동화 (Automations)

### 트리거 (Triggers)
| 트리거 | 설명 |
|--------|------|
| Page Added | 새 페이지(항목) 생성 시 |
| Property Edited | 특정 프로퍼티 값 변경 시 (조건 설정 가능: contains, is set to 등) |
| Recurring | 일정 주기 반복 실행 (매일/매주/매월 등, 시작/종료일, 시간대 설정) |

### 액션 (Actions)
| 액션 | 설명 |
|------|------|
| Edit Property | 현재 데이터베이스의 페이지 프로퍼티 수정 |
| Add Page To | 다른 데이터베이스에 새 페이지 생성 |
| Edit Pages In | 다른 데이터베이스의 페이지 편집 |
| Send Notification To | 워크스페이스 멤버에게 알림 전송 |
| Send Mail To | Gmail 계정으로 이메일 전송 |
| Send Webhook | HTTP 웹훅 POST 전송 |
| Send Slack Notification To | Slack 메시지 전송 (Plus/Business/Enterprise 플랜) |
| Define Variables | 수식/멘션 기반 변수 정의 |

### 자동화 기타 특징
- 자동화 내 수식 및 멘션 사용 가능
- AND/ANY 트리거 조건 설정
- 뷰 단위 또는 데이터베이스 전체 적용
- 트리거 동시 발생 허용 시간 창: 약 3초

---

## 11. AI 기능

### AI Autofill
- **자동 요약**: 페이지 본문을 요약해 텍스트 프로퍼티에 자동 입력
- **키워드 추출**: 본문에서 핵심 태그/카테고리 자동 분류
- **분류(Categorization)**: Select/Multi-select 프로퍼티 자동 할당
- **번역**: 콘텐츠를 다른 언어로 자동 번역
- **AI Custom Autofill**: 사용자 정의 프롬프트로 원하는 정보 추출/생성
- 행 추가/편집 시 자동 또는 수동 트리거

### AI 데이터베이스 쿼리
- 자연어로 데이터베이스 전체에 질문 (복잡한 쿼리 자동 생성)
- 프로퍼티와 노트를 횡단 검색하는 AI 레이어

### Formula AI
- 자연어 설명 → Notion 수식 자동 생성

---

## 12. 서브 아이템 & 의존성 (Sub-items & Dependencies)

### Sub-items (서브 아이템)
- 데이터베이스 항목 내에 하위 항목(서브태스크) 생성
- 재귀적으로 하위 항목의 하위 항목도 생성 가능
- 부모-자식 계층 구조 표현
- Relation 프로퍼티 기반 구현

### Dependencies (의존성)
- 타임라인 뷰에서 태스크 간 의존 관계 선 연결
- 선행 태스크 완료 후 후행 태스크 시작 시각화
- 프로젝트 크리티컬 패스 파악

---

## 13. 스프린트 & 태스크 데이터베이스 (Sprints)

### Task Database
- 스프린트 활성화를 위한 필수 프로퍼티: Status, Assignee, Due date
- 할당된 태스크가 Home의 "My tasks" 위젯에 자동 통합

### Sprint 기능
- **Current Sprint**: 현재 스프린트 태스크 표시
- **Sprint Planning**: 현재/다음/이전 스프린트 및 미배정 작업 표시
- **Backlog**: 스프린트에 배정되지 않은 태스크 관리
- **Sprints 데이터베이스**: 스프린트 개요 + 타임라인 뷰 제공

### Sprint 설정
- 스프린트 기간: 1~8주 선택
- 시작 요일 설정
- 미완성 태스크 처리: 다음 스프린트로 이동 / 백로그 반환 / 현재 위치 유지
- 스프린트 자동 완료 설정
- 스프린트 날짜는 설정 기반 자동 계산 (수동 수정 불가)

---

## 14. 폼 (Forms)

- 데이터베이스에 연결된 폼 빌더
- 폼 제출 시 데이터베이스에 새 페이지 자동 생성
- 폼 필드 = 데이터베이스 프로퍼티 (직접 매핑)
- 외부 공유 URL로 배포 가능
- 응답자 Notion 계정 불필요

---

## 15. 데이터 소스 (Data Sources)

- 하나의 데이터베이스 컨테이너 안에 여러 데이터 소스(독립 데이터베이스) 탭으로 통합
- 각 데이터베이스는 독립성 유지하면서 통합 뷰 제공
- 대시보드를 앱처럼 모듈화된 레이아웃으로 구성
- 여러 Linked View를 하나의 컨테이너로 대체

---

## 16. 권한 & 잠금 (Permissions & Locking)

### 데이터베이스 권한
| 권한 | 설명 |
|------|------|
| Full access | 구조 및 콘텐츠 모두 편집 |
| Can edit content | 페이지 생성/편집 가능. 프로퍼티/뷰 구조 수정 불가 |
| Can create pages | 새 페이지만 생성 가능. 타인 페이지 열람 불가 (비공개 회의록 등에 활용) |
| Can comment | 댓글만 가능 |
| Can view | 읽기 전용 |

### 데이터베이스 잠금 (Lock)
- 데이터베이스 구조 변경 방지 (프로퍼티 추가/삭제, 뷰 변경 불가)
- 잠긴 상태에서도 데이터(콘텐츠) 편집은 허용
- 실수로 인한 구조 변경 방지용

### 개인 뷰 필터
- 특정 필터를 본인에게만 적용 (공유 뷰 필터와 구분)

---

## 17. 템플릿 (Templates)

### 데이터베이스 템플릿
- 새 항목 생성 시 미리 정의된 구조와 내용으로 시작
- 템플릿별 기본 프로퍼티 값, 본문 내용 설정
- 여러 템플릿 등록 가능 (상황별 선택)
- 기본 템플릿 지정 가능 (항상 해당 템플릿으로 생성)
- 반복 회의록, 프로젝트 킥오프, 버그 리포트 등 재사용 패턴에 적합

---

## 18. 검색 & 기타 기능

### 데이터베이스 내 검색
- 3개 이상 항목이 있을 때 제목 및 프로퍼티 기반 검색 활성화

### 뷰 설정 (Per-View)
- **레이아웃**: 시각적 구성 방식
- **프로퍼티 가시성**: 뷰별로 보여줄 프로퍼티 선택
- **페이지 열기 방식**: 사이드 피크 / 센터 피크 / 풀페이지

### 뷰 탭 커스터마이징 (2026.04)
- 탭 표시 옵션: 텍스트+아이콘 / 텍스트만 / 아이콘만

### 열 고정 (Freeze Columns)
- 테이블 뷰에서 수평 스크롤 시 특정 열 고정

### 링크드 데이터베이스 (Linked Database)
- 기존 데이터베이스를 다른 페이지에 뷰로 삽입
- 원본 데이터는 유지하면서 다양한 뷰/필터 적용 가능

### 성능 최적화
- 대용량 데이터베이스 로드 시간 최적화 옵션
- 페이지네이션 및 지연 로딩

### 백링크 (Backlinks)
- 페이지가 어떤 데이터베이스/페이지에서 멘션되었는지 표시

### Presentation Mode
- 데이터베이스 페이지를 슬라이드쇼로 전환 (Notion 3.4)

---

## 참고 출처

- [Intro to databases – Notion Help Center](https://www.notion.com/help/intro-to-databases)
- [Database properties – Notion Help Center](https://www.notion.com/help/database-properties)
- [Views, filters, sorts & groups – Notion Help Center](https://www.notion.com/help/views-filters-and-sorts)
- [Chart view – Notion Help Center](https://www.notion.com/help/charts)
- [Board view – Notion Help Center](https://www.notion.com/help/boards)
- [Database automations – Notion Help Center](https://www.notion.com/help/database-automations)
- [Notion AI for databases – Notion Help Center](https://www.notion.com/help/autofill)
- [Task databases & sprints – Notion Help Center](https://www.notion.com/help/sprints)
- [What's New – Notion](https://www.notion.com/releases)
