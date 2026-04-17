#!/usr/bin/env python3
"""
Unblock Media 편집 파이프라인 러너 + 검증기.

Vercel에 배포된 unblock-agents A2A 서버(기본
https://a2a-slack-notion.vercel.app)의 10개 에이전트를 호출해 0~8단계를
순서대로 실행하고, 각 단계 산출물이 다음 단계가 요구하는 형태를 갖추었는지
자동 검증한다.

단계:
  0. Scraping   — 원문 준비 + 에이전트 카드 헬스체크
  1. Assignment — Damien이 기자 지정            (skill: assignment)
  2. Report     — 기자의 시장 조사               (skill: report)
  3. Guide      — 팀장의 기사 가이드             (skill: guide)
  4. Writing    — 기자의 기사 초안               (skill: writing)
  5. Feedback   — 팀장의 피드백                  (skill: feedback)
  6. Revision   — 기자의 수정본                  (skill: revision)
  7. Confirm    — Damien의 최종 승인/반려         (skill: confirm)
  8. Drawing    — Olive의 커버 이미지 응답        (skill: drawing)

사용:
  # 기본 샘플 원문으로 전체 파이프라인 실행 (Vercel 배포본 호출)
  python3 pipeline.py

  # 본인 원문 파일로 실행
  python3 pipeline.py --source article.txt

  # 다른 origin (로컬 dev 서버 등)
  python3 pipeline.py --base-url http://localhost:3000

  # 산출물을 폴더에 저장
  python3 pipeline.py --out runs/$(date +%Y%m%d-%H%M%S)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from zoneinfo import ZoneInfo  # py3.9+
    _KST = ZoneInfo("Asia/Seoul")
except Exception:  # pragma: no cover
    _KST = None


# ─────────────────────────────────────────────────────────────
# 에이전트 맵 — 코드 상의 agent id와 표시 이름 매핑
# ─────────────────────────────────────────────────────────────

REPORTERS: dict[str, dict[str, str]] = {
    "unblock-max":    {"kor": "맥스",     "en": "Max",    "specialty": "Bitcoin"},
    "unblock-techa":  {"kor": "테카",     "en": "Techa",  "specialty": "Blockchain/AI"},
    "unblock-mark":   {"kor": "마크",     "en": "Mark",   "specialty": "Altcoin/Memecoin"},
    "unblock-roy":    {"kor": "로이",     "en": "Roy",    "specialty": "Regulation/Legal"},
    "unblock-april":  {"kor": "에이프릴", "en": "April",  "specialty": "Projects/Interviews"},
}

MANAGERS: dict[str, dict[str, str]] = {
    "unblock-victoria": {"kor": "빅토리아", "en": "Victoria", "specialty": "Finance"},
    "unblock-logan":    {"kor": "로건",     "en": "Logan",    "specialty": "Tech/Projects"},
    "unblock-lilly":    {"kor": "릴리",     "en": "Lilly",    "specialty": "Law/Reg"},
}

# 기자 → 기본 팀장 매핑 (Damien이 기자만 지정한다고 가정하고 결정론적으로 배정)
REPORTER_TO_MANAGER: dict[str, str] = {
    "unblock-max":   "unblock-victoria",
    "unblock-mark":  "unblock-victoria",
    "unblock-techa": "unblock-logan",
    "unblock-april": "unblock-logan",
    "unblock-roy":   "unblock-lilly",
}

EDITOR_IN_CHIEF = "unblock-damien"
DESIGNER = "unblock-olive"

DEFAULT_BASE_URL = "https://a2a-slack-notion.vercel.app"

ALL_AGENT_IDS: list[str] = (
    list(REPORTERS.keys()) + list(MANAGERS.keys()) + [EDITOR_IN_CHIEF, DESIGNER]
)


# ─────────────────────────────────────────────────────────────
# JSON 이벤트 스트림 (대시보드 연동용)
# ─────────────────────────────────────────────────────────────
# --json-events 플래그가 켜지면 사람이 읽는 print 출력과 별도로 stdout에
# `__EVENT__<JSON>` 줄을 한 줄씩 추가로 방출한다. 대시보드는 이 prefix 줄만
# 파싱해서 에이전트 호출 카드로 렌더링한다.

_JSON_EVENTS_ENABLED = False

# 현재 진행 중인 step 메타를 이벤트에 동봉하기 위한 스레드-단순 상태.
_CURRENT_STEP: dict[str, Any] = {"step": None, "name": None}


def _emit_event(event: str, **payload: Any) -> None:
    if not _JSON_EVENTS_ENABLED:
        return
    body: dict[str, Any] = {
        "event": event,
        "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
    }
    if _CURRENT_STEP.get("step") is not None and "step" not in payload:
        body["step"] = _CURRENT_STEP["step"]
    if _CURRENT_STEP.get("name") and "step_name" not in payload:
        body["step_name"] = _CURRENT_STEP["name"]
    body.update(payload)
    sys.stdout.write("__EVENT__" + json.dumps(body, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _set_current_step(step: Any, name: str) -> None:
    _CURRENT_STEP["step"] = step
    _CURRENT_STEP["name"] = name
    _emit_event("step-start", step=step, step_name=name)


# ─────────────────────────────────────────────────────────────
# 기본 샘플 원문 (오늘 날짜 기준 기사용)
# ─────────────────────────────────────────────────────────────

SAMPLE_ARTICLE = """[Coindesk, 2026-04-16] 미국 증권거래위원회(SEC)는 15일(현지시각)
비트코인 현물 ETF의 옵션 거래 승인안을 만장일치로 통과시켰다고 밝혔다.
폴 앳킨스 SEC 위원장은 성명에서 "시장 투명성과 투자자 보호를 강화하기 위한
조치"라고 설명했으며, 블랙록·피델리티·아크인베스트가 운용하는 ETF가 대상에
포함됐다. 발표 직후 비트코인 가격은 24시간 전 대비 4.7% 상승해 9만2,300달러를
기록했고, 전체 ETF 순유입액은 하루 만에 7억2,000만달러에 달했다. 트럼프 대통령은
X(옛 트위터)에 "미국이 디지털 자산 수도가 될 날이 가까워졌다"고 게시했다."""


# ─────────────────────────────────────────────────────────────
# A2A 호출
# ─────────────────────────────────────────────────────────────

def today_kst() -> str:
    now = datetime.now(_KST) if _KST else datetime.now()
    return now.strftime("%Y-%m-%d")


def call_agent(
    base_url: str,
    agent_id: str,
    user_text: str,
    skill_id: str | None = None,
    variables: dict[str, str] | None = None,
    timeout: int = 180,
) -> tuple[str, dict[str, Any]]:
    """JSON-RPC `message/send`로 호출하고 에이전트 답변(text)만 뽑아 반환."""
    url = f"{base_url.rstrip('/')}/api/agents/{agent_id}"
    msg: dict[str, Any] = {
        "kind": "message",
        "messageId": f"msg-{int(time.time() * 1000)}",
        "role": "user",
        "parts": [{"kind": "text", "text": user_text}],
    }
    meta: dict[str, Any] = {}
    if skill_id:
        meta["skillId"] = skill_id
    if variables:
        meta["variables"] = variables
    if meta:
        msg["metadata"] = meta

    body = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000) & 0x7FFFFFFF,
        "method": "message/send",
        "params": {"message": msg},
    }
    _emit_event(
        "agent-request",
        agent_id=agent_id,
        agent_name=_agent_display_name(agent_id),
        skill=skill_id,
        url=url,
        prompt=user_text,
        variables=variables or {},
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        _emit_event(
            "agent-response",
            agent_id=agent_id,
            agent_name=_agent_display_name(agent_id),
            skill=skill_id,
            ok=False,
            error=str(e),
            duration_ms=int((time.time() - t0) * 1000),
        )
        raise RuntimeError(f"A2A 호출 실패 ({agent_id} / {skill_id}): {e}") from e

    duration_ms = int((time.time() - t0) * 1000)
    data = json.loads(raw)
    if "error" in data:
        _emit_event(
            "agent-response",
            agent_id=agent_id,
            agent_name=_agent_display_name(agent_id),
            skill=skill_id,
            ok=False,
            error=str(data["error"]),
            duration_ms=duration_ms,
        )
        raise RuntimeError(f"A2A 에러 ({agent_id}): {data['error']}")
    text = _extract_text(data.get("result") or {})
    _emit_event(
        "agent-response",
        agent_id=agent_id,
        agent_name=_agent_display_name(agent_id),
        skill=skill_id,
        ok=True,
        text=text,
        duration_ms=duration_ms,
    )
    return text, data


def _agent_display_name(agent_id: str) -> str:
    if agent_id in REPORTERS:
        info = REPORTERS[agent_id]
        return f"{info['kor']} ({info['en']})"
    if agent_id in MANAGERS:
        info = MANAGERS[agent_id]
        return f"{info['kor']} ({info['en']})"
    if agent_id == EDITOR_IN_CHIEF:
        return "Damien (편집국장)"
    if agent_id == DESIGNER:
        return "Olive (디자이너)"
    return agent_id


def _extract_text(obj: Any) -> str:
    """결과가 Message 또는 Task 어느 쪽이든 agent text를 꺼낸다."""
    if not isinstance(obj, dict):
        return ""
    parts = obj.get("parts")
    if isinstance(parts, list):
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("kind") == "text")
    status = obj.get("status") or {}
    if isinstance(status, dict) and status.get("message"):
        t = _extract_text(status["message"])
        if t:
            return t
    history = obj.get("history") or []
    for m in reversed(history):
        if isinstance(m, dict) and m.get("role") == "agent":
            t = _extract_text(m)
            if t:
                return t
    return ""


# ─────────────────────────────────────────────────────────────
# 파싱 헬퍼
# ─────────────────────────────────────────────────────────────

def pick_reporter_from_assignment(text: str) -> str | None:
    """Damien의 배정문에서 기자 agent id를 추출.
    @기자 멘션이 가장 신뢰도 높지만 그게 없으면 이름 등장 순서를 본다."""
    at_hits: list[tuple[int, str]] = []
    name_hits: list[tuple[int, str]] = []
    for agent_id, info in REPORTERS.items():
        for form in (info["kor"], info["en"]):
            at_pat = re.compile(rf"@\s*{re.escape(form)}\b", re.IGNORECASE)
            m = at_pat.search(text)
            if m:
                at_hits.append((m.start(), agent_id))
            name_pat = re.compile(rf"\b{re.escape(form)}\b", re.IGNORECASE)
            for nm in name_pat.finditer(text):
                name_hits.append((nm.start(), agent_id))
    if at_hits:
        at_hits.sort()
        return at_hits[0][1]
    if name_hits:
        name_hits.sort()
        return name_hits[0][1]
    return None


def pick_manager_for_reporter(reporter_id: str) -> str:
    return REPORTER_TO_MANAGER.get(reporter_id, "unblock-victoria")


# ─────────────────────────────────────────────────────────────
# 파이프라인
# ─────────────────────────────────────────────────────────────

@dataclass
class StepResult:
    step: int
    name: str
    agent_id: str
    skill: str | None
    text: str
    checks: list[tuple[str, bool, str]] = field(default_factory=list)  # (name, ok, note)

    @property
    def ok(self) -> bool:
        return all(c[1] for c in self.checks) and bool(self.text.strip())


@dataclass
class PipelineOutput:
    today: str
    source: str
    steps: list[StepResult] = field(default_factory=list)
    reporter_id: str | None = None
    manager_id: str | None = None

    @property
    def all_ok(self) -> bool:
        return all(s.ok for s in self.steps)


def run_pipeline(base_url: str, source_text: str, today: str | None = None) -> PipelineOutput:
    today = today or today_kst()
    out = PipelineOutput(today=today, source=source_text)

    _emit_event(
        "pipeline-start",
        base_url=base_url,
        today=today,
        source_len=len(source_text),
    )

    def section(step: int | str, title: str):
        print("\n" + "═" * 72)
        print(f" {step}. {title}")
        print("═" * 72)
        _set_current_step(step, title)

    def finish_step(step_result: StepResult) -> None:
        """append StepResult to out.steps and emit a step-end event."""
        out.steps.append(step_result)
        _emit_event(
            "step-end",
            step=step_result.step,
            step_name=step_result.name,
            agent_id=step_result.agent_id,
            skill=step_result.skill,
            ok=step_result.ok,
            checks=[
                {"name": name, "ok": ok, "note": note}
                for name, ok, note in step_result.checks
            ],
        )

    # ── 0-pre. 헬스체크: 10개 에이전트 카드 전부 응답하는가 ───
    section("0-pre", f"Agent cards health check — {base_url}")
    card_results: list[tuple[str, int]] = []
    all_up = True
    for agent_id in ALL_AGENT_IDS:
        url = f"{base_url.rstrip('/')}/api/agents/{agent_id}/.well-known/agent.json"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                code = resp.getcode()
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception:
            code = 0
        mark = "✓" if code == 200 else "✗"
        print(f"  {mark} {code}  {agent_id}")
        card_results.append((agent_id, code))
        if code != 200:
            all_up = False
    step_pre = StepResult(0, "Healthcheck", agent_id=base_url, skill=None, text=json.dumps(card_results))
    step_pre.checks.append(("10개 카드 전부 200", all_up, f"{sum(1 for _, c in card_results if c == 200)}/{len(card_results)}"))
    finish_step(step_pre)

    # ── 0. Scraping (입력 검증) ──────────────────────────────
    section(0, "Scraping — 원문 준비")
    print(f"오늘(KST): {today}")
    print(f"원문 길이: {len(source_text)}자")
    print("─" * 72)
    print(source_text.strip()[:400] + ("…" if len(source_text) > 400 else ""))
    step0 = StepResult(0, "Scraping", agent_id="-", skill=None, text=source_text)
    step0.checks.append(("원문 비어있지 않음", bool(source_text.strip()), ""))
    step0.checks.append(("원문 최소 길이(30자)", len(source_text.strip()) >= 30, f"{len(source_text.strip())}자"))
    finish_step(step0)

    # ── 1. Assignment (Damien) ──────────────────────────────
    section(1, f"Assignment — {EDITOR_IN_CHIEF} / skill=assignment")
    text, _ = call_agent(
        base_url, EDITOR_IN_CHIEF,
        user_text="아래 <자료>를 보고 기자를 배정해줘.",
        skill_id="assignment",
        variables={"TODAY_DATE": today, "BASIC_ARTICLE_SOURCE": source_text},
    )
    print(text)
    reporter_id = pick_reporter_from_assignment(text)
    out.reporter_id = reporter_id
    step1 = StepResult(1, "Assignment", EDITOR_IN_CHIEF, "assignment", text)
    step1.checks.append(("기자 이름 파싱됨", bool(reporter_id), reporter_id or "인식 실패"))
    step1.checks.append((f"오늘 날짜({today}) 언급", today in text or today.replace("-", ".") in text or _contains_date_token(text), ""))
    step1.checks.append(("반말 할당 어투(자네/맡기네/~게)", bool(re.search(r"(자네|맡기네|맡긴다|담당해|맡겨)", text)), ""))
    finish_step(step1)
    if not reporter_id:
        reporter_id = random.choice(list(REPORTERS.keys()))
        print(f"\n[경고] 기자 이름을 자동 파싱 실패. 랜덤 배정: {reporter_id}")
        out.reporter_id = reporter_id
    manager_id = pick_manager_for_reporter(reporter_id)
    out.manager_id = manager_id
    rep_kor = REPORTERS[reporter_id]["kor"]
    mgr_kor = MANAGERS[manager_id]["kor"]
    print(f"\n▶ 기자 배정: {reporter_id} ({rep_kor})   ▶ 팀장: {manager_id} ({mgr_kor})")

    # ── 2. Report (기자) ────────────────────────────────────
    section(2, f"Report — {reporter_id} / skill=report")
    chief_comment = step1.text  # Damien의 배정문 자체를 편집장 지시로 사용
    text, _ = call_agent(
        base_url, reporter_id,
        user_text="편집장 지시에 따라 시장 조사/리서치 보고를 작성해줘.",
        skill_id="report",
        variables={
            "TODAY_DATE": today,
            "BASIC_ARTICLE_SOURCE": source_text,
            "CHIEF_COMMENT": chief_comment,
        },
    )
    print(text)
    market_research = text
    step2 = StepResult(2, "Report", reporter_id, "report", text)
    step2.checks.append(("리서치 길이(≥200자)", len(text.strip()) >= 200, f"{len(text.strip())}자"))
    step2.checks.append(("출처 언급(~에 따르면)", "에 따르면" in text or "보도" in text, ""))
    step2.checks.append(("일자 언급(숫자+일/현지시각)", _contains_date_token(text), ""))
    finish_step(step2)

    # ── 3. Guide (팀장) ──────────────────────────────────────
    section(3, f"Guide — {manager_id} / skill=guide")
    text, _ = call_agent(
        base_url, manager_id,
        user_text=f"{rep_kor} 기자에게 기사 작성 가이드를 줘.",
        skill_id="guide",
        variables={"REPORTER": rep_kor, "MARKET_RESEARCH": market_research},
    )
    print(text)
    article_guide = text
    step3 = StepResult(3, "Guide", manager_id, "guide", text)
    step3.checks.append(("기자명 멘션", rep_kor in text or REPORTERS[reporter_id]["en"] in text, rep_kor))
    step3.checks.append(("한 문단 가이드(비어있지 않음)", len(text.strip()) >= 60, ""))
    finish_step(step3)

    # ── 4. Writing (기자) ────────────────────────────────────
    section(4, f"Writing — {reporter_id} / skill=writing")
    text, _ = call_agent(
        base_url, reporter_id,
        user_text="마켓리서치와 기사가이드를 바탕으로 기사 초안을 작성해줘.",
        skill_id="writing",
        variables={"MARKET_RESEARCH": market_research, "ARTICLE_GUIDE": article_guide},
    )
    print(text)
    article_draft = text
    step4 = StepResult(4, "Writing", reporter_id, "writing", text)
    struct = _analyze_article_structure(text)
    step4.checks.append(("제목 존재", struct["has_title"], struct["title"][:60]))
    step4.checks.append(("요약문 2개 (대시 불렛)", struct["bullet_count"] >= 2, f"불렛 {struct['bullet_count']}개"))
    step4.checks.append(("본문에 일자/출처 표기", struct["body_has_date_source"], ""))
    step4.checks.append(("본문 분량(≥400자)", struct["body_len"] >= 400, f"{struct['body_len']}자"))
    step4.checks.append(("페르소나 잡담 누출 없음", not struct["persona_leak"], "누출 감지됨" if struct["persona_leak"] else "OK"))
    finish_step(step4)

    # ── 5. Feedback (팀장) ───────────────────────────────────
    section(5, f"Feedback — {manager_id} / skill=feedback")
    text, _ = call_agent(
        base_url, manager_id,
        user_text=f"{rep_kor} 기자가 작성한 기사에 대해 피드백을 줘.",
        skill_id="feedback",
        variables={
            "REPORTER": rep_kor,
            "TODAY_DATE": today,
            "BASIC_ARTICLE_SOURCE": source_text,
            "ARTICLE_DRAFT": article_draft,
        },
    )
    print(text)
    manager_feedback = text
    step5 = StepResult(5, "Feedback", manager_id, "feedback", text)
    step5.checks.append(("기자명 멘션", rep_kor in text, rep_kor))
    step5.checks.append(("구체 지적(제목/요약/리드/본문 중 하나)", any(k in text for k in ["제목", "요약", "리드", "본문"]), ""))
    step5.checks.append(("반말 톤(~해/~자/~어)", bool(re.search(r"(해[.\s]|어[.\s]|자[.\s]|야[.\s])", text)), ""))
    finish_step(step5)

    # ── 6. Revision (기자) ──────────────────────────────────
    section(6, f"Revision — {reporter_id} / skill=revision")
    text, _ = call_agent(
        base_url, reporter_id,
        user_text="피드백을 반영해 기사를 수정해줘.",
        skill_id="revision",
        variables={"ARTICLE_DRAFT": article_draft, "MANAGER_FEEDBACK": manager_feedback},
    )
    print(text)
    corrected_article = text
    step6 = StepResult(6, "Revision", reporter_id, "revision", text)
    rstruct = _analyze_article_structure(text)
    step6.checks.append(("수정본 제목 존재", rstruct["has_title"], rstruct["title"][:60]))
    step6.checks.append(("수정본 요약문 2개", rstruct["bullet_count"] >= 2, f"불렛 {rstruct['bullet_count']}개"))
    step6.checks.append(("수정본 본문 일자/출처 표기", rstruct["body_has_date_source"], ""))
    step6.checks.append(("볼드(**,###) 사용 금지", ("**" not in text) and ("###" not in text), "사용됨" if ("**" in text or "###" in text) else "OK"))
    step6.checks.append(("분량 유지(초안의 60% 이상)", len(text.strip()) >= max(300, int(len(article_draft.strip()) * 0.6)), f"{len(text.strip())}/{len(article_draft.strip())}자"))
    step6.checks.append(("페르소나 잡담 누출 없음", not rstruct["persona_leak"], "누출 감지됨" if rstruct["persona_leak"] else "OK"))
    finish_step(step6)

    # ── 7. Confirm (Damien) ─────────────────────────────────
    section(7, f"Confirm — {EDITOR_IN_CHIEF} / skill=confirm")
    text, _ = call_agent(
        base_url, EDITOR_IN_CHIEF,
        user_text="수정된 기사에 대해 최종 승인 혹은 반려해줘.",
        skill_id="confirm",
        variables={
            "REPORTER": rep_kor,
            "TODAY_DATE": today,
            "CORRECTED_ARTICLE": corrected_article,
        },
    )
    print(text)
    verdict = _extract_verdict(text)
    step7 = StepResult(7, "Confirm", EDITOR_IN_CHIEF, "confirm", text)
    step7.checks.append(("승인/반려 판결 포함", verdict != "UNKNOWN", verdict))
    step7.checks.append(("한 문단(불렛 없음)", "\n-" not in text and "\n•" not in text, ""))
    finish_step(step7)

    # ── 8. Drawing (Olive) ──────────────────────────────────
    section(8, f"Drawing — {DESIGNER} / skill=drawing")
    text, _ = call_agent(
        base_url, DESIGNER,
        user_text=f"편집국장이 {rep_kor} 기자 기사({_first_nonblank_line(corrected_article)[:40]}…)의 커버 이미지를 만들어달라고 지시했어. 응답해줘.",
        skill_id="drawing",
    )
    print(text)
    step8 = StepResult(8, "Drawing", DESIGNER, "drawing", text)
    step8.checks.append(("응답 존재", bool(text.strip()), f"{len(text.strip())}자"))
    finish_step(step8)

    _emit_event(
        "pipeline-end",
        all_ok=out.all_ok,
        reporter_id=out.reporter_id,
        manager_id=out.manager_id,
        today=out.today,
    )
    return out


# ─────────────────────────────────────────────────────────────
# 검증 보조
# ─────────────────────────────────────────────────────────────

_DATE_TOKEN_RE = re.compile(
    r"(\d{1,2}\s*일|\d{4}-\d{2}-\d{2}|\d{4}\.\d{1,2}\.\d{1,2}|현지시각|현지 시각)"
)


def _contains_date_token(text: str) -> bool:
    return bool(_DATE_TOKEN_RE.search(text))


def _first_nonblank_line(text: str) -> str:
    for ln in text.splitlines():
        s = ln.strip()
        if s:
            return s
    return ""


_PERSONA_LEAK_PATTERNS = [
    r"오우\s*멋진\s*질문",
    r"어떠세요[?,\s]*(완벽|깔끔)",
    r"어때요[?,\s]*(완벽|깔끔)",
    r"솔직히\s*(깔끔|완벽)",
    r"이해에?\s*도움이?\s*되었",
    r"궁금한\s*점이?\s*있으시면",
]


def _has_persona_leak(text: str) -> bool:
    for pat in _PERSONA_LEAK_PATTERNS:
        if re.search(pat, text):
            return True
    # 이모지(너무 엄격하지 않게: 기사 바디에 이모지 여러 개면 잡담 신호)
    emoji_count = len(re.findall(r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF]", text))
    return emoji_count >= 2


def _analyze_article_structure(text: str) -> dict[str, Any]:
    """기사 초안/수정본이 최소 구조(제목/요약2불렛/본문+일자·출처)를 갖췄는지.

    제목 탐지는 페르소나 잡담 preamble을 건너뛰고 `##`/`#` 마크다운 헤딩을
    우선 사용한다. 헤딩이 없으면 첫 번째 비어있지 않은 '짧은' 줄을 제목
    후보로 본다. 불렛은 제목 뒤 어디든(연속 여부 무관) 전체 문서에서 세되,
    '- ' 로 시작하는 요약문 스타일만 인정."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    title = ""
    title_idx = -1

    # 1순위: 첫 번째 '#' 마크다운 헤딩
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith("#"):
            title = s.lstrip("# ").strip()
            title_idx = i
            break

    # 2순위: 헤딩이 없으면 첫 번째 비어있지 않고 '짧은'(< 80자) + 문장부호로
    # 끝나지 않는 줄 — 대화체 preamble 제외
    if title_idx == -1:
        for i, ln in enumerate(lines):
            s = ln.strip()
            if not s:
                continue
            if len(s) < 80 and not s.endswith(("요.", "다.", "죠.", "요!", "요?", "죠?", "까?")):
                title = s
                title_idx = i
                break
        else:
            # fallback: 그냥 첫 줄
            for i, ln in enumerate(lines):
                if ln.strip():
                    title = ln.strip()
                    title_idx = i
                    break

    # 불렛 개수: 제목 이후 전체에서 '- ' / '* ' 로 시작하는 요약문 스타일만
    # (본문 내 일반 대시가 혼용될 수 있어 '요약문이 될 만한 형태'로 제한)
    bullet_count = 0
    first_bullet_idx = -1
    last_bullet_idx = -1
    for j in range(title_idx + 1, len(lines)):
        s = lines[j].strip()
        if not s:
            continue
        if (s.startswith("- ") or s.startswith("* ")) and len(s) > 4:
            bullet_count += 1
            if first_bullet_idx == -1:
                first_bullet_idx = j
            last_bullet_idx = j

    # 본문 = 마지막 불렛 다음 줄부터 (불렛이 있다면), 아니면 제목 다음
    body_start = (last_bullet_idx + 1) if last_bullet_idx != -1 else (title_idx + 1)
    body = "\n".join(lines[body_start:]).strip()

    return {
        "title": title,
        "has_title": bool(title) and len(title) >= 3,
        "bullet_count": bullet_count,
        "body_len": len(body),
        "body_has_date_source": _contains_date_token(body) and ("에 따르면" in body or "보도" in body),
        "persona_leak": _has_persona_leak(text),
    }


def _extract_verdict(text: str) -> str:
    if "반려" in text:
        return "REJECTED"
    if "승인" in text or "발행" in text or "좋아" in text:
        return "APPROVED"
    return "UNKNOWN"


# ─────────────────────────────────────────────────────────────
# 결과 요약 + 저장
# ─────────────────────────────────────────────────────────────

def print_summary(out: PipelineOutput) -> None:
    print("\n" + "━" * 72)
    print(" 검증 요약")
    print("━" * 72)
    for s in out.steps:
        total = len(s.checks)
        passed = sum(1 for _, ok, _ in s.checks if ok)
        status = "[OK]" if s.ok else "[FAIL]"
        head = f"{status} {s.step}. {s.name:<10} {s.agent_id:<20} skill={s.skill or '-':<10}  ({passed}/{total})"
        print(head)
        for name, ok, note in s.checks:
            mark = "  ✓" if ok else "  ✗"
            suffix = f"  — {note}" if note else ""
            print(f"    {mark} {name}{suffix}")
    print("━" * 72)
    verdict = "전체 성공" if out.all_ok else "일부 검증 실패"
    print(f" 결과: {verdict}  (reporter={out.reporter_id}, manager={out.manager_id}, today={out.today})")
    print("━" * 72)


def save_outputs(out: PipelineOutput, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    # 각 단계 원문 저장
    for s in out.steps:
        p = out_dir / f"{s.step:02d}_{s.name.lower()}.txt"
        p.write_text(s.text, encoding="utf-8")
    # 검증 결과 JSON
    summary = {
        "today": out.today,
        "reporter_id": out.reporter_id,
        "manager_id": out.manager_id,
        "all_ok": out.all_ok,
        "steps": [
            {
                "step": s.step,
                "name": s.name,
                "agent_id": s.agent_id,
                "skill": s.skill,
                "ok": s.ok,
                "checks": [
                    {"name": name, "ok": ok, "note": note}
                    for name, ok, note in s.checks
                ],
                "output_file": f"{s.step:02d}_{s.name.lower()}.txt",
            }
            for s in out.steps
        ],
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n산출물 저장: {out_dir}/")


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Unblock Media 편집 파이프라인 러너 + 검증기")
    ap.add_argument("--source", help="원문 텍스트 파일 경로 (생략 시 내장 샘플 사용)")
    ap.add_argument("--base-url", default=os.environ.get("BASE_URL", DEFAULT_BASE_URL),
                    help=f"A2A 서버 base URL (기본: {DEFAULT_BASE_URL})")
    ap.add_argument("--today", help="TODAY_DATE 강제 지정 (YYYY-MM-DD). 생략 시 서버 KST 자동 주입")
    ap.add_argument("--out", help="각 단계 산출물을 저장할 디렉터리")
    ap.add_argument(
        "--json-events",
        action="store_true",
        help="stdout에 각 이벤트(step-start/agent-request/agent-response/step-end)를 "
             "`__EVENT__<JSON>` 한 줄 형태로 함께 방출 — 대시보드 스트리밍 뷰 연동용",
    )
    args = ap.parse_args()

    global _JSON_EVENTS_ENABLED
    _JSON_EVENTS_ENABLED = bool(args.json_events)

    if args.source:
        source_text = Path(args.source).read_text(encoding="utf-8").strip()
    else:
        source_text = SAMPLE_ARTICLE

    # 서버 reachability 간단 체크 (상세 헬스체크는 run_pipeline의 0-pre 단계에서)
    try:
        urllib.request.urlopen(
            f"{args.base_url.rstrip('/')}/api/agents/{EDITOR_IN_CHIEF}/.well-known/agent.json",
            timeout=8,
        )
    except Exception as e:
        print(f"[에러] A2A 서버 {args.base_url} 에 접근할 수 없습니다: {e}", file=sys.stderr)
        return 2

    out = run_pipeline(args.base_url, source_text, today=args.today)
    print_summary(out)
    if args.out:
        save_outputs(out, Path(args.out))
    return 0 if out.all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
