#!/usr/bin/env python3
"""
배정 → 리포트 → 가이드 3-step 테스트.

데미안이 기자+팀장을 배정하고, 기자가 시장 조사 리포트를 작성한 뒤,
팀장이 가이드를 작성하는 세 단계를 실행한다.

팀장 배정: unblockmedia-backend와 동일하게 데미안의 배정문에서
팀장 이름을 파싱한다 (기자와 팀장 모두 데미안이 지정).

사용:
  python3 test_guide.py                      # 랜덤 샘플
  python3 test_guide.py --topic regulation    # 특정 주제
  python3 test_guide.py --source article.txt  # 직접 원문
  python3 test_guide.py --base-url http://localhost:3000
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
from datetime import datetime
from typing import Any

try:
    from zoneinfo import ZoneInfo
    _KST = ZoneInfo("Asia/Seoul")
except Exception:
    _KST = None

# ─────────────────────────────────────────────────────────────
# 에이전트 맵
# ─────────────────────────────────────────────────────────────

REPORTERS: dict[str, dict[str, str]] = {
    "unblock-max":   {"kor": "맥스",     "en": "Max",    "specialty": "Bitcoin"},
    "unblock-techa": {"kor": "테카",     "en": "Techa",  "specialty": "Blockchain/AI"},
    "unblock-mark":  {"kor": "마크",     "en": "Mark",   "specialty": "Altcoin/Memecoin"},
    "unblock-roy":   {"kor": "로이",     "en": "Roy",    "specialty": "Regulation/Legal"},
    "unblock-april": {"kor": "에이프릴", "en": "April",  "specialty": "Projects/Interviews"},
}

MANAGERS: dict[str, dict[str, str]] = {
    "unblock-victoria": {"kor": "빅토리아", "en": "Victoria", "specialty": "Finance"},
    "unblock-logan":    {"kor": "로건",     "en": "Logan",    "specialty": "Tech/Projects"},
    "unblock-lilly":    {"kor": "릴리",     "en": "Lilly",    "specialty": "Law/Reg"},
}

EDITOR_IN_CHIEF = "unblock-damien"
DEFAULT_BASE_URL = "https://a2a-slack-notion.vercel.app"

# ─────────────────────────────────────────────────────────────
# 주제별 샘플 기사
# ─────────────────────────────────────────────────────────────

SAMPLES: dict[str, str] = {
    "bitcoin": (
        "[Coindesk, 2026-04-16] 미국 증권거래위원회(SEC)는 15일(현지시각) "
        "비트코인 현물 ETF의 옵션 거래 승인안을 만장일치로 통과시켰다고 밝혔다. "
        "블랙록·피델리티·아크인베스트가 운용하는 ETF가 대상에 포함됐다. "
        "발표 직후 비트코인 가격은 24시간 전 대비 4.7% 상승해 9만2,300달러를 기록했다."
    ),
    "regulation": (
        "[Reuters, 2026-04-16] 유럽연합(EU) 집행위원회는 15일 MiCA(암호자산시장규제법) "
        "시행 세칙 최종안을 공개했다. 스테이블코인 발행사는 준비금의 60%를 유럽 내 "
        "은행에 예치해야 하며, 위반 시 일일 거래액의 1%에 해당하는 과징금을 부과받는다. "
        "테더(USDT) 측은 성명을 통해 '과도한 규제'라며 반발했다."
    ),
    "ai": (
        "[The Block, 2026-04-16] 바이낸스는 15일 자체 블록체인 BNB Chain에 "
        "온체인 AI 에이전트 프레임워크 'BNB AI Hub'를 출시한다고 발표했다. "
        "개발자는 스마트 컨트랙트 내에서 직접 LLM을 호출할 수 있으며, "
        "추론 비용은 BNB 토큰으로 결제된다. 출시 파트너로 Google Cloud와 "
        "Anthropic이 참여한다."
    ),
    "altcoin": (
        "[CoinTelegraph, 2026-04-16] 솔라나(SOL)가 지난 24시간 동안 18% 급등하며 "
        "시가총액 기준 4위로 올라섰다. Firedancer 클라이언트의 메인넷 정식 배포 "
        "소식이 호재로 작용했으며, 솔라나 DEX 거래량은 이더리움을 처음으로 "
        "추월했다. 분석가들은 '알트코인 시즌의 신호탄'이라고 평가했다."
    ),
    "project": (
        "[Decrypt, 2026-04-16] 전 코인베이스 CTO 발라지 스리니바산이 이끄는 "
        "탈중앙 소셜 프로토콜 'Network State Labs'가 1억 5,000만 달러 규모의 "
        "시리즈 A 투자를 유치했다고 발표했다. a16z crypto가 리드했으며, "
        "올해 3분기 중 베타 런칭을 목표로 하고 있다."
    ),
}

EXPECTED_REPORTER: dict[str, str] = {
    "bitcoin":    "unblock-max",
    "regulation": "unblock-roy",
    "ai":         "unblock-techa",
    "altcoin":    "unblock-mark",
    "project":    "unblock-april",
}


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
) -> str:
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
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        raise RuntimeError(f"A2A 호출 실패 ({agent_id} / {skill_id}): {e}") from e

    data = json.loads(raw)
    if "error" in data:
        raise RuntimeError(f"A2A 에러 ({agent_id}): {data['error']}")
    return _extract_text(data.get("result") or {})


def _extract_text(obj: Any) -> str:
    if not isinstance(obj, dict):
        return ""
    parts = obj.get("parts")
    if isinstance(parts, list):
        return "".join(
            p.get("text", "") for p in parts
            if isinstance(p, dict) and p.get("kind") == "text"
        )
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
# 이름 파싱 — 데미안 응답에서 기자 + 팀장 모두 추출
# ─────────────────────────────────────────────────────────────

def _pick_from_roster(
    text: str, roster: dict[str, dict[str, str]]
) -> str | None:
    """@멘션 우선, 없으면 이름 등장 순서로 agent_id를 추출."""
    at_hits: list[tuple[int, str]] = []
    name_hits: list[tuple[int, str]] = []
    for agent_id, info in roster.items():
        for form in (info["kor"], info["en"]):
            m = re.search(rf"@\s*{re.escape(form)}\b", text, re.IGNORECASE)
            if m:
                at_hits.append((m.start(), agent_id))
            for nm in re.finditer(rf"\b{re.escape(form)}\b", text, re.IGNORECASE):
                name_hits.append((nm.start(), agent_id))
    if at_hits:
        at_hits.sort()
        return at_hits[0][1]
    if name_hits:
        name_hits.sort()
        return name_hits[0][1]
    return None


def pick_reporter(text: str) -> str | None:
    return _pick_from_roster(text, REPORTERS)


def pick_manager(text: str) -> str | None:
    return _pick_from_roster(text, MANAGERS)


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="배정 → 리포트 → 가이드 3-step 테스트"
    )
    ap.add_argument("--topic", choices=list(SAMPLES.keys()),
                    help="샘플 주제 (생략 시 랜덤)")
    ap.add_argument("--source", help="원문 텍스트 파일 경로")
    ap.add_argument("--base-url",
                    default=os.environ.get("BASE_URL", DEFAULT_BASE_URL))
    ap.add_argument("--today", help="TODAY_DATE 강제 지정 (YYYY-MM-DD)")
    args = ap.parse_args()

    today = args.today or today_kst()

    # 원문 결정
    if args.source:
        from pathlib import Path
        source = Path(args.source).read_text(encoding="utf-8").strip()
        topic = "custom"
    elif args.topic:
        topic = args.topic
        source = SAMPLES[topic]
    else:
        topic = random.choice(list(SAMPLES.keys()))
        source = SAMPLES[topic]

    print("=" * 60)
    print(f" 3-Step 테스트  |  주제: {topic}  |  날짜: {today}")
    print("=" * 60)
    print(f"\n[원문]\n{source}\n")

    # ── Step 1: 데미안 배정 (기자 + 팀장) ────────────────────
    print("─" * 60)
    print("STEP 1 — 데미안 배정 (skill=assignment)")
    print("─" * 60)

    assignment = call_agent(
        args.base_url, EDITOR_IN_CHIEF,
        user_text="아래 <자료>를 보고 기자와 팀장을 배정해줘.",
        skill_id="assignment",
        variables={"TODAY_DATE": today, "BASIC_ARTICLE_SOURCE": source},
    )
    print(assignment)

    # 기자 파싱
    reporter_id = pick_reporter(assignment)
    if not reporter_id:
        reporter_id = random.choice(list(REPORTERS.keys()))
        print(f"\n⚠ 기자 파싱 실패 → 랜덤 배정: {reporter_id}")
    rep = REPORTERS[reporter_id]

    # 팀장 파싱 (데미안 응답에서 추출 — unblockmedia-backend 방식)
    manager_id = pick_manager(assignment)
    if not manager_id:
        manager_id = random.choice(list(MANAGERS.keys()))
        print(f"\n⚠ 팀장 파싱 실패 → 랜덤 배정: {manager_id}")
    mgr = MANAGERS[manager_id]

    expected = EXPECTED_REPORTER.get(topic)
    match = "✓" if reporter_id == expected else "✗"
    print(f"\n▶ 기자 배정: {rep['kor']}({rep['en']}) — {reporter_id}")
    if expected:
        print(f"  기대: {expected}  {match}")
    print(f"▶ 팀장 배정: {mgr['kor']}({mgr['en']}) — {manager_id}")

    # ── Step 2: 기자 시장 조사 ───────────────────────────────
    print("\n" + "─" * 60)
    print(f"STEP 2 — {rep['kor']} 시장 조사 (skill=report)")
    print("─" * 60)

    report = call_agent(
        args.base_url, reporter_id,
        user_text="편집장 지시에 따라 시장 조사/리서치 보고를 작성해줘.",
        skill_id="report",
        variables={
            "TODAY_DATE": today,
            "BASIC_ARTICLE_SOURCE": source,
            "CHIEF_COMMENT": assignment,
        },
    )
    print(report)

    # ── Step 3: 팀장 가이드 ──────────────────────────────────
    print("\n" + "─" * 60)
    print(f"STEP 3 — {mgr['kor']} 가이드 (skill=guide)")
    print("─" * 60)

    guide = call_agent(
        args.base_url, manager_id,
        user_text=f"{rep['kor']} 기자에게 기사 작성 가이드를 줘.",
        skill_id="guide",
        variables={
            "REPORTER": rep["kor"],
            "MARKET_RESEARCH": report,
        },
    )
    print(guide)

    # ── 결과 요약 ────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(" 결과 요약")
    print("=" * 60)
    print(f"  주제:      {topic}")
    print(f"  기자 배정:  {rep['kor']}({rep['en']}) — {reporter_id}", end="")
    if expected:
        print(f"  {match}", end="")
    print()
    print(f"  팀장 배정:  {mgr['kor']}({mgr['en']}) — {manager_id}")
    print(f"  리포트 길이: {len(report.strip())}자  {'✓' if report.strip() else '✗'}")
    print(f"  가이드 길이: {len(guide.strip())}자  {'✓' if guide.strip() else '✗'}")
    print("=" * 60)

    return 0 if report.strip() and guide.strip() else 1


if __name__ == "__main__":
    sys.exit(main())
